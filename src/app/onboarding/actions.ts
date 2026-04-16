"use server";

import { revalidateTag } from "next/cache";
import { requireSignedIn } from "@/lib/auth";
import { validateUsername, UUID_RE } from "@/lib/validation";
import { createGymMembership } from "@/lib/data/mutations";
import { formatError } from "@/lib/errors";
import { revalidateUserProfile } from "@/lib/cache/revalidate";
import type { Gym } from "@/lib/data";

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
    console.warn("[chork] fetchListedGyms failed:", error);
    return [];
  }
  return data ?? [];
}

export async function completeOnboarding(
  username: string,
  name: string,
  gymId: string
): Promise<{ error: string } | { success: true }> {
  // Input validation
  const { error: usernameError } = validateUsername(username);
  if (usernameError) return { error: usernameError };
  if (typeof name !== "string") return { error: "Invalid name" };
  if (!UUID_RE.test(gymId)) return { error: "Please select a gym" };

  const trimmedName = name.trim().slice(0, MAX_NAME_LENGTH);

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Create gym membership first — if this fails, we haven't changed the profile
    await createGymMembership(supabase, userId, gymId);

    // Then update the profile
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        username,
        name: trimmedName,
        onboarded: true,
        active_gym_id: gymId,
      })
      .eq("id", userId);

    if (profileError) {
      // Rollback: delete the membership we just created
      await supabase
        .from("gym_memberships")
        .delete()
        .eq("user_id", userId)
        .eq("gym_id", gymId);
      return { error: formatError(profileError) };
    }

    // Onboarding sets username, name, active_gym_id and the onboarded
    // flag — all profile-row fields. revalidateUserProfile busts both
    // user:{uid}:profile and user:username-{u}:profile so the next
    // /u/{username} render picks up the freshly-set name + theme.
    // Active-set tag is busted too so the home page wall renders the
    // climber's new gym's set without waiting for TTL.
    await revalidateUserProfile(supabase, userId);
    revalidateTag(`gym:${gymId}:active-set`);
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
