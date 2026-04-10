"use server";

import { requireSignedIn } from "@/lib/auth";
import { createGymMembership } from "@/lib/data/mutations";
import { formatError } from "@/lib/errors";

export async function completeOnboarding(
  username: string,
  name: string,
  gymId: string
): Promise<{ error: string } | { success: true }> {
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
