"use server";

import { requireAuth, requireSameGymScope } from "@/lib/auth";
import { getLeaderboardUserRow } from "@/lib/data/leaderboard-queries";
import { UUID_RE } from "@/lib/validation";

/**
 * Fetch the leaderboard placement for the given user + set.
 * Used by the SetDetailSheet on the profile page.
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

  // Cross-gym scope gate — set belongs to caller's gym AND target is
  // a member of it. One auditable home in auth.ts, shared with
  // fetchClimberSheetLogs (leaderboard/actions.ts).
  const scope = await requireSameGymScope(supabase, gymId, setId, profileUserId);
  if ("error" in scope) return { error: scope.error };

  const row = await getLeaderboardUserRow(supabase, gymId, profileUserId, setId);
  return { rank: row?.rank ?? null };
}
