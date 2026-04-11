"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "./supabase/server";
import { createServiceClient } from "./supabase/server";
import { requireAuth, requireSignedIn } from "./auth";
import { validateUsername } from "./validation";
import { formatError } from "./errors";

/**
 * Check if a username is available.
 */
export async function checkUsernameAvailable(
  username: string,
  userId: string
): Promise<boolean> {
  const { error } = validateUsername(username);
  if (error) return false;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", userId)
    .limit(1);
  return !data || data.length === 0;
}

/**
 * Update the authenticated user's profile.
 * Accepts name and/or username. Username is validated and checked for uniqueness.
 */
export async function updateProfile(
  updates: { name?: string; username?: string }
): Promise<{ error: string } | { success: true }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const payload: { name?: string; username?: string } = {};

  if (updates.name !== undefined) {
    payload.name = updates.name;
  }

  if (updates.username !== undefined) {
    const { error: usernameError } = validateUsername(updates.username);
    if (usernameError) return { error: usernameError };
    const available = await checkUsernameAvailable(updates.username, userId);
    if (!available) return { error: "Username is taken" };
    payload.username = updates.username;
  }

  if (Object.keys(payload).length === 0) return { error: "Nothing to update" };

  try {
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);

    if (error) return { error: formatError(error) };
    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Delete the authenticated user's account.
 * Uses the service role to call auth.admin.deleteUser, which cascades
 * through profiles and all related tables.
 */
export async function deleteAccount(): Promise<{ error: string } | { success: true }> {
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { userId } = auth;

  try {
    const service = createServiceClient();
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
