"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "./supabase/server";
import { requireAuth, requireSignedIn } from "./auth";
import { validateUsername } from "./validation";
import { formatError } from "./errors";
import {
  getFollowers as getFollowersQuery,
  getFollowing as getFollowingQuery,
  type FollowListUser,
} from "./data/queries";

/**
 * Check if a username is available.
 * Requires authentication - derives userId from session, ignores client-supplied value.
 */
export async function checkUsernameAvailable(
  username: string,
  _userId?: string
): Promise<boolean> {
  const { error: validationError } = validateUsername(username);
  if (validationError) return false;

  const auth = await requireSignedIn();
  if ("error" in auth) return false;
  const { supabase, userId } = auth;

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
    if (typeof updates.name !== "string") return { error: "Invalid name" };
    payload.name = updates.name.trim().slice(0, 80);
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
 * Upload an avatar image and update the user's profile.
 * Uses Supabase Storage (avatars bucket). Replaces any existing avatar.
 */
export async function uploadAvatar(
  formData: FormData
): Promise<{ error: string } | { success: true; url: string }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };
  // Client should resize to 256x256 JPEG before upload.
  // These are safety limits, not the primary validation.
  if (file.size > 500 * 1024) return { error: "Image too large - should be resized client-side" };
  if (file.type !== "image/jpeg") return { error: "Only JPEG accepted" };

  const path = `${userId}/avatar.jpg`;

  try {
    // Use service client for storage — RLS on storage buckets requires
    // separate policies. Service client bypasses this safely since we
    // already verified auth and scope the path to the user's own folder.
    const service = createServiceClient();
    const { error: uploadError } = await service.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (uploadError) return { error: formatError(uploadError) };

    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);

    // Append timestamp to bust browser cache
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    if (profileError) return { error: formatError(profileError) };

    revalidatePath("/", "layout");
    return { success: true, url: publicUrl };
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** List of users following the given user id. Any signed-in user can view. */
export async function fetchFollowers(
  userId: string
): Promise<{ users: FollowListUser[] } | { error: string }> {
  if (!UUID_RE.test(userId)) return { error: "Invalid user" };
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  return { users: await getFollowersQuery(auth.supabase, userId) };
}

/** List of users the given user id follows. Any signed-in user can view. */
export async function fetchFollowing(
  userId: string
): Promise<{ users: FollowListUser[] } | { error: string }> {
  if (!UUID_RE.test(userId)) return { error: "Invalid user" };
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  return { users: await getFollowingQuery(auth.supabase, userId) };
}
