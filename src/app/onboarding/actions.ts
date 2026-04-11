"use server";

import { requireSignedIn } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { validateUsername } from "@/lib/validation";
import { createGymMembership } from "@/lib/data/mutations";
import { searchGyms as searchGymsQuery } from "@/lib/data/queries";
import { formatError } from "@/lib/errors";
import type { Gym } from "@/lib/data";

/**
 * Fetch listed gyms. Used by the onboarding gym picker.
 * Goes through the data access layer instead of querying Supabase from the client.
 */
export async function fetchListedGyms(): Promise<Gym[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
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
  if (typeof gymId !== "string" || !gymId) return { error: "Please select a gym" };

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
        name,
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

    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
