"use server";

import { revalidateTag } from "next/cache";
import { requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { getNotifications } from "@/lib/data/notifications";
import type { NotificationRow } from "@/lib/data/notifications";
import { isUuid } from "@/lib/validation";

/**
 * Fetch the caller's recent notifications. Called by the NotificationsSheet
 * the first time it opens — keeps the 50-row payload off the profile
 * page's critical path so the shell can paint with just an unread count.
 */
export async function fetchNotifications(
  limit: number = 50,
): Promise<{ rows: NotificationRow[] } | { error: string }> {
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  // Clamp to [1, 100]; non-finite inputs fall back to the default.
  // Without the Number.isFinite gate, `NaN` / `Infinity` would slip
  // through Math.floor and poison the underlying .limit(NaN).
  const raw = Number.isFinite(limit) ? Math.floor(limit) : 50;
  const safeLimit = Math.max(1, Math.min(100, raw));
  const rows = await getNotifications(auth.supabase, safeLimit);
  return { rows };
}

/**
 * Mark every unread notification belonging to the caller as read.
 * Invoked when the NotificationsSheet opens — RLS limits the
 * update to the caller's own rows regardless of what the client
 * sends, so no IDs need to leave the browser.
 */
export async function markAllNotificationsRead(): Promise<{ error: string } | { success: true }> {
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) return { error: formatError(error) };

    revalidateTag(`user:${userId}:notifications`);
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Permanently drop a single notification row. Used for the swipe /
 * dismiss action inside the NotificationsSheet.
 */
export async function dismissNotification(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!isUuid(id)) return { error: "Invalid notification" };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return { error: formatError(error) };

    revalidateTag(`user:${userId}:notifications`);
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
