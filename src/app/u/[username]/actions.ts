"use server";

import { requireAuth } from "@/lib/auth";
import { getLeaderboardUserRow } from "@/lib/data/queries";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetch the leaderboard placement for the given user + set.
 * Used by the SetDetailSheet on the profile page.
 * Verifies the set belongs to the caller's gym and the target user
 * is a member of that gym (same cross-gym-scope pattern used by
 * fetchClimberSheetData).
 */
export async function fetchSetPlacement(
  profileUserId: string,
  setId: string
): Promise<{ rank: number | null } | { error: string }> {
  if (!UUID_RE.test(profileUserId) || !UUID_RE.test(setId)) {
    return { error: "Invalid request" };
  }

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, gymId } = auth;

  // Verify set belongs to caller's gym
  const { data: setRow, error: setError } = await supabase
    .from("sets")
    .select("gym_id")
    .eq("id", setId)
    .maybeSingle();
  if (setError || !setRow || setRow.gym_id !== gymId) {
    return { error: "Set not found" };
  }

  // Verify target user is a member of the caller's gym
  const { data: membership } = await supabase
    .from("gym_memberships")
    .select("user_id")
    .eq("user_id", profileUserId)
    .eq("gym_id", gymId)
    .maybeSingle();
  if (!membership) {
    return { error: "Not in this gym" };
  }

  const row = await getLeaderboardUserRow(supabase, gymId, profileUserId, setId);
  return { rank: row?.rank ?? null };
}
