"use server";

import { gateSignedInMutation, requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { getNotifications } from "@/lib/data/notifications";
import type { NotificationRow } from "@/lib/data/notifications";
import { isNotificationKind, type NotificationKind } from "@/lib/data/notification-kinds";
import type { ActionResult } from "@/lib/action-result";

/**
 * Fetch the caller's recent notifications, optionally scoped to the
 * kinds a section owns. Kept for client-side refreshes; the section
 * cards themselves read server-side via `getNotifications`.
 */
export async function fetchNotifications(
  kinds?: string[],
  limit: number = 50,
): Promise<ActionResult<{ rows: NotificationRow[] }>> {
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const safeKinds = validKinds(kinds);
  if (safeKinds === "invalid") return { error: "Unknown notification kind" };
  // Clamp to [1, 100]; non-finite inputs fall back to the default.
  // Without the Number.isFinite gate, `NaN` / `Infinity` would slip
  // through Math.floor and poison the underlying .limit(NaN).
  const raw = Number.isFinite(limit) ? Math.floor(limit) : 50;
  const safeLimit = Math.max(1, Math.min(100, raw));
  const rows = await getNotifications(auth.supabase, {
    kinds: safeKinds,
    limit: safeLimit,
  });
  return { success: true, rows };
}

/**
 * Validate a caller-supplied kind list against the kind table.
 * Undefined stays undefined (= no scoping); any unknown string
 * rejects the whole call rather than silently narrowing.
 */
function validKinds(
  kinds: string[] | undefined,
): NotificationKind[] | undefined | "invalid" {
  if (kinds === undefined) return undefined;
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.length > 16) {
    return "invalid";
  }
  return kinds.every(isNotificationKind) ? (kinds as NotificationKind[]) : "invalid";
}

/**
 * Mark the caller's unread notifications as read — scoped to the
 * kinds a section showed, so visiting /friends never read-flags a
 * match invite that hasn't been seen. No kinds = everything. RLS
 * limits the update to the caller's own rows regardless of what the
 * client sends, so no IDs need to leave the browser.
 */
export async function markAllNotificationsRead(
  kinds?: string[],
): Promise<ActionResult> {
  const auth = await gateSignedInMutation(null, "notification");
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const safeKinds = validKinds(kinds);
  if (safeKinds === "invalid") return { error: "Unknown notification kind" };

  try {
    // Stamp via `now()` inside the RPC (migrations 053 → 136) rather
    // than `new Date().toISOString()` here — Node's wall clock
    // shouldn't decide the canonical read timestamp when the
    // `created_at` column next to it is Postgres-stamped. The fn also
    // enforces `p_user_id = auth.uid()` so a stale JWT can't quietly
    // read-flag someone else's unread row.
    const { error } = await supabase.rpc("mark_all_notifications_read", {
      p_user_id: userId,
      p_kinds: safeKinds ? [...safeKinds] : undefined,
    });
    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Permanently drop a single notification row — the dismiss control
 * on a section's notification list.
 */
export async function dismissNotification(id: string): Promise<ActionResult> {
  const auth = await gateSignedInMutation(id, "notification");
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
