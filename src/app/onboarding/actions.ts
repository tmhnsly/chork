"use server";

import { requireAuth } from "@/lib/auth";
import { createGymMembership } from "@/lib/data/mutations";
import { formatError } from "@/lib/errors";

export async function completeOnboarding(
  username: string,
  name: string,
  gymId: string
): Promise<{ error: string } | { success: true }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Update profile
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        username,
        name,
        onboarded: true,
        active_gym_id: gymId,
      })
      .eq("id", userId);

    if (profileError) return { error: formatError(profileError) };

    // Create gym membership
    await createGymMembership(supabase, userId, gymId);

    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
