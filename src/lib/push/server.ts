import "server-only";
import { after } from "next/server";
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * How many push endpoints to dispatch in parallel. Web-push calls
 * are network-bound (tens to hundreds of ms each); with an
 * unbounded `Promise.all` on a crew of 200 climbers we were
 * holding a server action open for the duration of the slowest
 * endpoint. A concurrency cap keeps the total wall time bounded
 * (≈ ceil(n / CONCURRENCY) × mean latency) without saturating the
 * outbound connection pool.
 */
const PUSH_CONCURRENCY = 10;

// Re-use a single configured instance — web-push reads VAPID creds from
// module-level state, so calling setVapidDetails repeatedly is wasteful.
let configured = false;

function configure(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:chork@example.com";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** True when VAPID is configured. Caller can skip dispatch otherwise. */
export function pushEnabled(): boolean {
  return configure();
}

export interface PushPayload {
  title: string;
  body: string;
  /** Optional path on chork to open when the user taps the notification. */
  url?: string;
}

/**
 * Dispatch a push payload to every subscription owned by the given user
 * ids. Reads push_subscriptions via the service role — the caller is
 * always trusted server-side code (server action or scheduled job).
 *
 * Invalid endpoints (404 / 410 from the push service) are garbage-
 * collected from the DB as we discover them so the next dispatch isn't
 * slowed down by dead devices.
 *
 * Failures are logged but never thrown — the caller doesn't need to
 * handle them, push is a best-effort channel.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; removed: number } | { skipped: true }> {
  if (userIds.length === 0) return { sent: 0, removed: 0 };
  if (!configure()) return { skipped: true };

  const service = createServiceClient();
  const { data: subscriptions, error } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (error || !subscriptions || subscriptions.length === 0) {
    return { sent: 0, removed: 0 };
  }

  const body = JSON.stringify(payload);
  const toRemove: string[] = [];
  let sent = 0;

  // Bounded parallelism. A simple worker-pool: each "worker" pulls
  // the next endpoint off the queue until none remain. Keeps memory
  // flat and honours `PUSH_CONCURRENCY` regardless of recipient count.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(PUSH_CONCURRENCY, subscriptions.length) }, async () => {
    while (cursor < subscriptions.length) {
      const row = subscriptions[cursor++];
      const sub: WebPushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(sub, body);
        sent += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404 / 410 = subscription is gone, evict from DB. Any other
        // error (network, payload too large, etc.) we leave alone and
        // log for triage.
        if (status === 404 || status === 410) {
          toRemove.push(row.id);
        } else {
          console.warn("[chork] push send failed:", err);
        }
      }
    }
  });
  await Promise.all(workers);

  if (toRemove.length > 0) {
    await service.from("push_subscriptions").delete().in("id", toRemove);
  }

  return { sent, removed: toRemove.length };
}

/**
 * Fire-and-forget variant — schedules the push dispatch to run *after*
 * the current response is sent via Next.js 15's `after()`. The caller
 * returns immediately; push latency stops blocking server-action
 * round-trips.
 *
 * Prefer this for user-facing mutations (completeRoute, inviteToCrew,
 * etc.). Swallows errors internally — push is best-effort.
 */
export function sendPushInBackground(userIds: string[], payload: PushPayload): void {
  if (userIds.length === 0) return;
  after(async () => {
    try {
      await sendPushToUsers(userIds, payload);
    } catch (err) {
      console.warn("[chork] background push dispatch failed:", err);
    }
  });
}

/**
 * Resolve the climber user-ids for a gym: everyone who has at least
 * one row in route_logs for that gym. Matches the "active climber"
 * rule we use across admin analytics — static gym_memberships would
 * notify people who signed up but never showed.
 */
export async function getGymClimberUserIds(gymId: string): Promise<string[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("route_logs")
    .select("user_id")
    .eq("gym_id", gymId);
  if (error || !data) return [];
  return [...new Set(data.map((r) => r.user_id))];
}
