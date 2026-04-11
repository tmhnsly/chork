"use server";

import { createServerSupabase } from "./supabase/server";
import { requireAuth } from "./auth";
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
 * Only the display name is accepted — sensitive fields like
 * onboarded, active_gym_id, and username are managed by dedicated actions.
 */
export async function updateProfile(
  updates: { name?: string }
): Promise<{ error: string } | { success: true }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  // Only allow name updates
  const name = updates.name;
  if (name === undefined) return { error: "Nothing to update" };

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ name })
      .eq("id", userId);

    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
