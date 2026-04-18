"use server";

import { revalidateTag } from "next/cache";
import { requireSignedIn } from "@/lib/auth";
import { validateUsername, UUID_RE } from "@/lib/validation";
import { createGymMembership } from "@/lib/data/mutations";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { revalidateUserProfile } from "@/lib/cache/revalidate";
import type { Gym } from "@/lib/data";

import { logger } from "@/lib/logger";
import { tags } from "@/lib/cache/tags";
const MAX_NAME_LENGTH = 80;

/**
 * Fetch listed gyms. Used by the onboarding gym picker.
 * Requires sign-in so unauthenticated bots can't poll this endpoint.
 */
export async function fetchListedGyms(): Promise<Gym[]> {
  const auth = await requireSignedIn();
  if ("error" in auth) return [];

  const { data, error } = await auth.supabase
    .from("gyms")
    .select("*")
    .eq("is_listed", true)
    .order("name");
  if (error) {
    logger.warn("fetchlistedgyms_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return data ?? [];
}

export async function completeOnboarding(
  username: string,
  name: string,
  gymId: string | null
): Promise<{ error: string } | { success: true }> {
  // Input validation
  const { error: usernameError } = validateUsername(username);
  if (usernameError) return { error: usernameError };
  if (typeof name !== "string") return { error: "Invalid name" };
  // Normalise empty strings into null — some callers (older tests,
  // form submissions with an unchecked field) pass "" for "no gym".
  // Treat that as an intentional gymless signup rather than a
  // malformed UUID.
  const normalisedGymId = gymId && gymId.trim().length > 0 ? gymId : null;
  // If a value remains after normalisation, it must be a valid UUID.
  if (normalisedGymId !== null && !UUID_RE.test(normalisedGymId)) {
    return { error: "Invalid gym selection" };
  }

  const trimmedName = name.trim().slice(0, MAX_NAME_LENGTH);

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Gym path: create membership first so if it fails we haven't
    // touched the profile. Gymless path: skip the membership insert.
    if (normalisedGymId) {
      await createGymMembership(supabase, userId, normalisedGymId);
    }

    // Update the profile. `active_gym_id` stays null for gymless
    // signups — schema already allows it.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        username,
        name: trimmedName,
        onboarded: true,
        active_gym_id: normalisedGymId,
      })
      .eq("id", userId);

    if (profileError) {
      // Rollback the membership insert if we made one.
      if (normalisedGymId) {
        await supabase
          .from("gym_memberships")
          .delete()
          .eq("user_id", userId)
          .eq("gym_id", normalisedGymId);
      }
      return { error: formatError(profileError) };
    }

    // Onboarding sets username, name, active_gym_id and the onboarded
    // flag — all profile-row fields. revalidateUserProfile busts both
    // user:{uid}:profile and user:username-{u}:profile so the next
    // /u/{username} render picks up the freshly-set name + theme.
    // Active-set tag is busted too so the home page wall renders the
    // climber's new gym's set without waiting for TTL.
    await revalidateUserProfile(supabase, userId);
    if (normalisedGymId) {
      revalidateTag(tags.gymActiveSet(normalisedGymId), "max");
    }
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
