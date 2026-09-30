"use server";

import { gateSignedInMutation } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { isNotificationKind, type NotificationKind } from "@/lib/data/notification-kinds";
import type { ActionResult } from "@/lib/action-result";

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
    // Stamp via `now()` inside the RPC (migrations 053 → 143) rather
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
