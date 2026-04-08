"use server";

import { createServerSupabase } from "./supabase/server";
import { requireAuth } from "./auth";
import { USERNAME_RE } from "./validation";
import { formatError } from "./errors";

/**
 * Check if a username is available.
 */
export async function checkUsernameAvailable(
  username: string,
  userId: string
): Promise<boolean> {
  if (!username || username.length < 3 || !USERNAME_RE.test(username)) {
    return false;
  }
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
 */
export async function updateProfile(
  updates: { username?: string; name?: string; onboarded?: boolean; active_gym_id?: string }
): Promise<{ error: string } | { success: true }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
