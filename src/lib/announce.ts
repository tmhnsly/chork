import "server-only";

import { sendPushInBackground } from "@/lib/push/server";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";

/**
 * Announcement dispatch — see CONTEXT.md "Announcement".
 *
 * A broadcast push with no per-recipient log row, no opt-out category,
 * fan-out to many users. Distinct from a `Notification` (which has a
 * persistent log row + opt-out filtering); reach for `notify()` from
 * `lib/notify.ts` for per-recipient social events.
 *
 * Dispatch is best-effort: errors are swallowed + logged so the
 * caller's mutation (set going live, etc.) never fails because the
 * push fan-out hit a hiccup. The underlying `sendPushInBackground`
 * also no-ops gracefully when VAPID isn't configured, so local dev /
 * fresh clones don't need keys.
 *
 * Behaviour ordering: synchronous resolve as soon as the dispatch is
 * scheduled. Actual web-push round-trips run in the background via
 * `after()` so the caller's server action returns immediately — the
 * admin's "publish" click doesn't block on per-subscription HTTP.
 */
export interface Announcement {
  /** Every user_id who should receive the push. May be empty (no-op). */
  userIds: string[];
  /** Push payload — same shape as the underlying web-push message. */
  title: string;
  body: string;
  /** Same-origin path the service worker opens on tap. Falls back to `/`. */
  url?: string;
}

export function announce(message: Announcement): void {
  try {
    if (message.userIds.length === 0) return;
    sendPushInBackground(message.userIds, {
      title: message.title,
      body: message.body,
      url: message.url ?? "/",
    });
  } catch (err) {
    // Defence-in-depth: sendPushInBackground already swallows; if the
    // user-id fetch ever moves inside the announce surface, this
    // catch keeps the caller's mutation safe.
    logger.warn("announce_failed", { err: formatErrorForLog(err) });
  }
}
