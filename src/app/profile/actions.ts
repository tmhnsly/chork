"use server";

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { revalidateUserProfile } from "@/lib/cache/revalidate";
import {
  PUSH_CATEGORIES,
  columnOf,
  type PushCategory,
} from "@/lib/data/push-categories";
import { gateSignedInMutation, requireSignedIn } from "@/lib/auth";
import { validateUsername } from "@/lib/validation";
import { formatError } from "@/lib/errors";
import { tags } from "@/lib/cache/tags";
import type { ActionResult } from "@/lib/action-result";

// The climber's own account: profile fields, theme, push opt-ins, the
// avatar, deletion. Every write here is gymless-safe by design — a
// climber with no active gym still owns their name and their face —
// which is why these gate on `gateSignedInMutation`, never the
// gym-scoped `requireAuth` (CLAUDE.md "A gym is optional"). Until
// 2026-08 four of them used `requireAuth`, so a gymless climber
// couldn't change their theme.
//
// Lived at `src/lib/user-actions.ts` until 2026-08-30; moved under
// `src/app/` so the action-module sweeps (and `action-hygiene.test.ts`)
// find it.

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
): Promise<ActionResult> {
  const auth = await gateSignedInMutation(null, "profile");
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
    // The new username's by-username cache entry busts directly; the
    // old one needs an explicit bust on rename. revalidateUserProfile
    // would re-look-up but we already have both names in scope.
    if (payload.username) {
      revalidateTag(tags.userByUsername(payload.username), "max");
      if (oldUsername && oldUsername !== payload.username) {
        revalidateTag(tags.userByUsername(oldUsername), "max");
      }
    } else if (oldUsername) {
      revalidateTag(tags.userByUsername(oldUsername), "max");
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
): Promise<ActionResult> {
  if (typeof theme !== "string" || theme.length > 32) {
    return { error: "Invalid theme" };
  }

  const auth = await gateSignedInMutation(null, "profile");
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ theme })
      .eq("id", userId);
    if (error) return { error: formatError(error) };
    await revalidateUserProfile(supabase, userId);
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}


export async function updatePushCategory(
  category: string,
  enabled: boolean,
): Promise<ActionResult> {
  if (!(category in PUSH_CATEGORIES)) {
    return { error: "Unknown notification category" };
  }
  if (typeof enabled !== "boolean") {
    return { error: "Invalid value" };
  }

  const auth = await gateSignedInMutation(null, "profile");
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const column = columnOf(category as PushCategory);

  try {
    // `column` is keyed off a non-user-controlled constant map —
    // the cast here is for Supabase's generated update type, not a
    // security bypass.
    const { error } = await supabase
      .from("profiles")
      .update({ [column]: enabled } as never)
      .eq("id", userId);
    if (error) return { error: formatError(error) };
    // The opt-in bools live on the profile row, which is cached whole
    // by username — bust it so the settings sheet reads back what was
    // just written rather than the cached copy.
    await revalidateUserProfile(supabase, userId);
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
): Promise<ActionResult<{ url: string }>> {
  // 500 KB of Storage per call — the write limit matters here more
  // than on a row update.
  const auth = await gateSignedInMutation(null, "profile");
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };
  // Client should resize to 256x256 JPEG before upload.
  // These are safety limits, not the primary validation.
  if (file.size > 500 * 1024) return { error: "Image too large - should be resized client-side" };
  // file.type is the BROWSER-SUPPLIED Content-Type from the multipart
  // form. Trust it for early rejection only — the authoritative check
  // is the magic-byte sniff below.
  if (file.type !== "image/jpeg") return { error: "Only JPEG accepted" };

  const path = `${userId}/avatar.jpg`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Magic-byte check: JPEG starts with 0xFF 0xD8. Without this, a
    // client could send a non-JPEG payload (HTML, SVG, polyglot) with
    // Content-Type: image/jpeg, and we'd happily upload it + force
    // `contentType: "image/jpeg"` on the storage object, then write
    // the URL to profiles.avatar_url. Next's image optimiser would
    // process it as JPEG and could surface image-parser CVEs. The
    // sniff closes that window. Cheap (2-byte read), no library.
    if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      return { error: "File doesn't look like a JPEG" };
    }
    // Hash the actual file bytes — stable per-content, not per-upload
    // attempt. Re-uploading the same image yields the same URL so
    // browser + CDN caches don't churn. A genuine new image flips the
    // hash and forces a fetch. Truncated to 8 hex chars: enough
    // entropy for cache-busting, short enough not to bloat URLs.
    const contentHash = createHash("sha1").update(buffer).digest("hex").slice(0, 8);

    // Use service client for storage — RLS on storage buckets requires
    // separate policies. Service client bypasses this safely since we
    // already verified auth and scope the path to the user's own folder.
    const service = createServiceClient();
    const { error: uploadError } = await service.storage
      .from("avatars")
      .upload(path, buffer, { upsert: true, contentType: "image/jpeg" });
    if (uploadError) return { error: formatError(uploadError) };

    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);

    // Content-hash query param — see comment above.
    const publicUrl = `${urlData.publicUrl}?v=${contentHash}`;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    if (profileError) return { error: formatError(profileError) };

    // Bust the by-username profile cache — `avatar_url` is on the row
    // `getProfileByUsername` caches for 300s, so without this a new
    // face reached the climber's own nav (refreshProfile) but not
    // /u/{username} for five minutes. A tag bust, not
    // `revalidatePath("/", "layout")`: that scorched every RSC segment
    // under root and added ~1-2s of perceived "Uploading…".
    await revalidateUserProfile(supabase, userId);
    return { success: true, url: publicUrl };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Delete the authenticated user's account.
 * Uses the service role to call auth.admin.deleteUser, which cascades
 * through profiles and all related tables.
 *
 * The by-username profile cache is busted too, before and after. It
 * wasn't: `/u/{username}` kept serving the deleted climber's name,
 * face and gym for the cache TTL plus one stale-while-revalidate
 * render — and if someone claimed the freed handle meanwhile, the
 * page could hand THEIR visitors the old profile, id and all. Seen
 * for real on 2026-08-19: a handle re-registered after a hand-deleted
 * account rendered its new owner's own profile as a stranger's, with
 * the old avatar, for one request. Before the delete because the
 * username lookup needs the row; after because a request between the
 * two could re-cache it.
 */
export async function deleteAccount(): Promise<ActionResult> {
  const auth = await gateSignedInMutation(null, "account");
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { data: row } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const username = row?.username ?? null;
    if (username) revalidateTag(tags.userByUsername(username), "max");

    const service = createServiceClient();

    // Crews used to need a hand-off here: `crews.created_by` cascades
    // on profile delete, so deleting an owner silently destroyed the
    // crew for everyone else. Crews are gone (migration 108) and
    // `friends` has no such asymmetry — a link cascades away from both
    // sides and takes nothing with it.
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) return { error: formatError(error) };
    if (username) revalidateTag(tags.userByUsername(username), "max");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
