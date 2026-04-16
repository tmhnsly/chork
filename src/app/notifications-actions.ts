"use server";

import { revalidateTag } from "next/cache";
import { requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";

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
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id)) return { error: "Invalid notification" };

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
