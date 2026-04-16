"use server";

import { revalidateTag } from "next/cache";
import { createServiceClient } from "./supabase/server";
import { requireAuth, requireSignedIn } from "./auth";
import { validateUsername } from "./validation";
import { formatError } from "./errors";

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

  // Capture old username pre-update so we can bust both old and new
  // username-keyed cache entries on rename.
  let oldUsername: string | null = null;
  if (payload.username !== undefined) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();
    oldUsername = data?.username ?? null;
  }

  try {
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);

    if (error) return { error: formatError(error) };
    revalidateTag(`user:${userId}:profile`);
    if (payload.username && oldUsername && oldUsername !== payload.username) {
      revalidateTag(`user:username-${oldUsername}:profile`);
      revalidateTag(`user:username-${payload.username}:profile`);
    } else if (payload.username) {
      revalidateTag(`user:username-${payload.username}:profile`);
    }
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Persist the climber's theme palette so it follows them across
 * devices. Validation is deliberately permissive — the column is a
 * free-form string so adding a new theme to `THEME_META` doesn't
 * require a migration. Invalid values fall back to "default" on
 * read in `theme.tsx`.
 */
export async function updateThemePreference(
  theme: string,
): Promise<{ error: string } | { success: true }> {
  if (typeof theme !== "string" || theme.length > 32) {
    return { error: "Invalid theme" };
  }

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ theme })
      .eq("id", userId);
    if (error) return { error: formatError(error) };
    revalidateTag(`user:${userId}:profile`);
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Per-category push opt-in flags. Maps to the discrete bools added
 * in migration 032; the push dispatcher filters recipients on the
 * matching column before firing. Unknown categories are rejected.
 */
const PUSH_CATEGORY_COLUMN = {
  invite_received: "push_invite_received",
  invite_accepted: "push_invite_accepted",
  ownership_changed: "push_ownership_changed",
} as const;
export type PushCategoryKey = keyof typeof PUSH_CATEGORY_COLUMN;

export async function updatePushCategory(
  category: string,
  enabled: boolean,
): Promise<{ error: string } | { success: true }> {
  if (!(category in PUSH_CATEGORY_COLUMN)) {
    return { error: "Unknown notification category" };
  }
  if (typeof enabled !== "boolean") {
    return { error: "Invalid value" };
  }

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const column = PUSH_CATEGORY_COLUMN[category as PushCategoryKey];

  try {
    // `column` is keyed off a non-user-controlled constant map —
    // the cast here is for Supabase's generated update type, not a
    // security bypass.
    const { error } = await supabase
      .from("profiles")
      .update({ [column]: enabled } as never)
      .eq("id", userId);
    if (error) return { error: formatError(error) };
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

    // Deliberately NOT calling `revalidatePath("/", "layout")` here —
    // it busts every cached RSC segment under root (heavy) and isn't
    // needed: the returned URL already has a `?t=` cache-buster, and
    // the client calls refreshProfile() + router.refresh() itself.
    // Including it here added ~1-2s of perceived "Uploading…" time
    // after the actual upload finished.
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

// fetchFollowers / fetchFollowing removed — the follows feature was
// replaced by crews in migration 021.
