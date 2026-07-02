import "server-only";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { toJson } from "@/lib/data/json-shape";
import { sendPushInBackground } from "@/lib/push/server";
import { tags } from "@/lib/cache/tags";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import {
  renderNotification,
  type NotificationEvent,
} from "@/lib/data/notification-kinds";

/**
 * Notification dispatch — see CONTEXT.md "Notification".
 *
 * One call per domain event. Owns:
 *   - persistent log row insert (notify_user RPC, service-role)
 *   - push dispatch (best-effort, opt-out filtered by category)
 *   - userNotifications tag bust
 *   - self-skip when actor === recipient
 *
 * Per-kind identity (payload shape, push copy, in-app copy) lives in
 * the definition table in `@/lib/data/notification-kinds` — this
 * module only sequences the side effects.
 *
 * Caller passes pre-fetched context (crew name, usernames) — keeps
 * the dispatcher free of DB reads so unit tests stay simple. Best-
 * effort throughout: a log-write failure or push throw never unwinds
 * the caller's mutation.
 */

export type NotifyEvent = NotificationEvent;

export async function notify(event: NotifyEvent): Promise<void> {
  if (event.actor && event.actor === event.recipient) return;

  const { payload, push } = renderNotification(event);

  try {
    const service = createServiceClient();
    const { error } = await service.rpc("notify_user", {
      p_user_id: event.recipient,
      p_kind: event.kind,
      // payload is one of the table's fixed-shape interfaces (string
      // fields only). `toJson` is the single documented site that
      // widens a closed interface to the generated `Json` union —
      // see json-shape.ts for the rationale.
      p_payload: toJson(payload),
    });
    if (error) {
      logger.warn("notify_log_failed", {
        kind: event.kind,
        err: formatErrorForLog(error),
      });
    }
  } catch (err) {
    logger.warn("notify_log_threw", {
      kind: event.kind,
      err: formatErrorForLog(err),
    });
  }

  try {
    // `push.category` (table-side literal union) must stay assignable
    // to `PushCategory` — a drifted value fails the build right here.
    sendPushInBackground(
      [event.recipient],
      { title: push.title, body: push.body, url: push.url },
      { category: push.category },
    );
  } catch (err) {
    logger.warn("notify_push_threw", {
      kind: event.kind,
      err: formatErrorForLog(err),
    });
  }

  revalidateTag(tags.userNotifications(event.recipient), "max");
}
