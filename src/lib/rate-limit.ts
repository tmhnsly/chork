import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env, hasUpstash } from "./env";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
/**
 * Per-user rate limiting for server actions.
 *
 * Runs through Upstash (Redis-backed, edge-native) rather than a
 * Postgres RPC so hot-path mutations don't eat a Supabase connection
 * pool slot just to decide whether to proceed. p99 < 10 ms.
 *
 * Graceful degradation: when `UPSTASH_REDIS_REST_URL` +
 * `UPSTASH_REDIS_REST_TOKEN` aren't set (fresh clone, local dev,
 * CI without Redis), `enforce()` returns `{ ok: true }`. The server
 * still authenticates + validates + enforces RLS; rate limiting is
 * an extra layer, not the first line of defence.
 *
 * The three buckets mirror real abuse vectors, not service-tier
 * policy:
 *   • `mutationsWrite` — 60/min. Covers normal session pacing
 *     (an active climber logs maybe 1 route/min during a real
 *     session) + optimistic retries. Stops a hostile authed
 *     user hammering `completeRoute` / `postComment` / etc.
 *   • `invitesSend` — 10/hour. Layered with the existing
 *     `bump_invite_rate_limit` SQL RPC (migration 021) for
 *     defence-in-depth.
 *   • `pushSubscribe` — 5/min. A browser that legitimately
 *     changes its push endpoint does it once per install, not
 *     dozens of times.
 */

// Single Redis client, lazily created. Upstash's REST client is stateless
// so there's no real cost to module-init, but we gate on `hasUpstash` to
// avoid the `Redis.fromEnv()` throw when vars are absent.
let _redis: Redis | null = null;
function redis(): Redis | null {
  if (!hasUpstash) return null;
  if (!_redis) {
    _redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// Limiter factories are memoised so we don't reconstruct the sliding
// window algorithm on every `enforce()` call.
type LimiterKey = "mutationsWrite" | "invitesSend" | "pushSubscribe";

const _limiters: Partial<Record<LimiterKey, Ratelimit>> = {};

function limiter(key: LimiterKey): Ratelimit | null {
  const client = redis();
  if (!client) return null;
  if (_limiters[key]) return _limiters[key]!;

  switch (key) {
    case "mutationsWrite":
      _limiters[key] = new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        prefix: "rl:write",
        analytics: false,
      });
      break;
    case "invitesSend":
      _limiters[key] = new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: "rl:invite",
        analytics: false,
      });
      break;
    case "pushSubscribe":
      _limiters[key] = new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(5, "1 m"),
        prefix: "rl:push",
        analytics: false,
      });
      break;
  }
  return _limiters[key]!;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; error: string; retryAfter: number };

/**
 * Check whether `userId` is under the cap for `key`. Increments the
 * counter as a side effect. Callers pass the returned `error` string
 * straight back to the client as an `ActionResult.error`.
 *
 * If Upstash is unconfigured, returns `{ ok: true }` without
 * contacting Redis. If the Redis call fails (network, quota, etc.)
 * we also fail-open rather than block legitimate traffic on infra
 * flakes — the UI surfaces the mutation error normally.
 */
export async function enforce(
  key: LimiterKey,
  userId: string,
): Promise<RateLimitResult> {
  const lim = limiter(key);
  if (!lim) return { ok: true };

  try {
    const { success, reset } = await lim.limit(userId);
    if (success) return { ok: true };
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return {
      ok: false,
      error: `Too many requests. Try again in ${retryAfter}s.`,
      retryAfter,
    };
  } catch (err) {
    // Fail-open: a Redis outage shouldn't brick mutations. Log + pass.
    // (logger.ts is introduced in a later phase; for now we use
    // console.warn matching the rest of the code's error path.)
    logger.warn("rate_limit_enforce_failed", { err: formatErrorForLog(err) });
    return { ok: true };
  }
}
