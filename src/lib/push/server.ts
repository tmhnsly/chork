import "server-only";
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

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

  await Promise.all(
    subscriptions.map(async (row) => {
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
    })
  );

  if (toRemove.length > 0) {
    await service.from("push_subscriptions").delete().in("id", toRemove);
  }

  return { sent, removed: toRemove.length };
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
