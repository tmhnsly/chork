import "server-only";

import { unstable_cache } from "next/cache";

import { tags } from "@/lib/cache/tags";
/**
 * Tag taxonomy — any string literal outside this union is a type error.
 * Keeps mutations, cache wraps, and `revalidateTag` calls in lockstep.
 *
 *   gym:{id}                    — gym row edits
 *   gym:{id}:active-set         — set goes live / ends in a gym
 *   set:{id}:routes             — route edits within a set
 *   set:{id}:leaderboard        — any route_log change affecting set rank
 *   user:{id}:profile           — profile row edits (username, theme, etc)
 *   user:{id}:stats             — this user's user_set_stats changed
 *   user:{id}:crews             — crew membership changed for this user
 *   user:{id}:jams              — jam history changed for this user
 *   user:{id}:notifications     — new / read notifications for this user
 *   crew:{id}                   — crew row or member set edits
 *   gyms:listed                 — a gym's is_listed flag changed
 *   competition:{id}            — competition row or relations changed
 */
export type Tag =
  | `gym:${string}`
  | `gym:${string}:active-set`
  | `gym:${string}:stats-all-time`
  | `set:${string}:routes`
  | `set:${string}:leaderboard`
  | `route:${string}:grade`
  | `route:${string}:comments`
  | `user:${string}:profile`
  | `user:username-${string}:profile`
  | `user:${string}:stats`
  | `user:${string}:crews`
  | `user:${string}:jams`
  | `user:${string}:notifications`
  | `crew:${string}`
  | `gyms:listed`
  | `competition:${string}`;

/**
 * Wraps `unstable_cache` with the tag taxonomy so every cached helper
 * in the app shares one vocabulary. `keyParts` distinguishes cache
 * entries; `tags` determine invalidation; `revalidate` is the ceiling
 * in seconds.
 *
 * Serialisation: unstable_cache stringifies the function's arguments
 * when keying, so every argument the wrapped function takes must be
 * deterministically serialisable (string, number, bool, etc). Passing
 * a Supabase client directly is NOT safe — wrap helpers that need a
 * client using the factory-per-call pattern (cachedQuery inside a
 * thin outer function that constructs the client on cache miss).
 *
 * Authorisation: cache entries are shared across users, so cached
 * helpers must not depend on the caller's auth cookies. The pattern
 * used in queries.ts is to construct a service-role client inside the
 * cached body (createCachedContextClient) — authorisation happens at
 * the page level BEFORE the cached call, via requireAuth /
 * requireGymAdmin / is_gym_member on the app side.
 */
export function cachedQuery<A extends unknown[], R>(
  keyParts: string[],
  fn: (...args: A) => Promise<R>,
  opts: { tags: Tag[]; revalidate: number },
): (...args: A) => Promise<R> {
  return unstable_cache(fn, keyParts, opts);
}
