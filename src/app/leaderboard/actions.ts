"use server";

import { requireAuth } from "@/lib/auth";
import {
  getLeaderboardCached,
  getLeaderboardNeighbourhood,
  getLeaderboardUserRow,
  getLogsBySetForUser,
} from "@/lib/data/queries";
import { UUID_RE } from "@/lib/validation";
import type { LeaderboardEntry } from "@/lib/data";

const TOP_LIMIT = 5;
const PAGE_LIMIT = 10;

interface TabData {
  top: LeaderboardEntry[];
  userRow: LeaderboardEntry | null;
  neighbourhood: LeaderboardEntry[];
}

/** Fetch initial data for a tab — top 5, user's row, and neighbourhood if needed. */
export async function fetchLeaderboardTab(
  setId: string | null
): Promise<{ data: TabData } | { error: string }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  // requireAuth above guarantees gymId === profile.active_gym_id —
  // the user is implicitly a member, so the cached helpers (which
  // skip the per-call membership check) are safe here.
  const [top, userRow] = await Promise.all([
    getLeaderboardCached(gymId, setId, TOP_LIMIT, 0),
    getLeaderboardUserRow(supabase, gymId, userId, setId),
  ]);

  const userOutsideTop = userRow === null
    ? true
    : userRow.rank === null || userRow.rank > TOP_LIMIT;

  const neighbourhood = userOutsideTop && userRow?.rank !== null
    ? await getLeaderboardNeighbourhood(supabase, gymId, userId, setId)
    : [];

  return { data: { top, userRow, neighbourhood } };
}

/**
 * Lazy-load a page of the full leaderboard.
 *
 * @param limit Optional override of PAGE_LIMIT — the browse-board UI
 *              uses smaller windows (5) so up/down moves a manageable
 *              chunk at a time. Defaults to PAGE_LIMIT for callers
 *              that haven't been updated.
 */
export async function fetchLeaderboardPage(
  setId: string | null,
  offset: number,
  limit: number = PAGE_LIMIT,
): Promise<{ rows: LeaderboardEntry[]; limit: number } | { error: string }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { gymId } = auth;

  // Clamp limit to sensible bounds so a malformed client value can't
  // request the entire board or zero rows.
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await getLeaderboardCached(gymId, setId, safeLimit, offset);
  return { rows, limit: safeLimit };
}

/**
 * Sanitised log for another climber's view — preserves enough info to derive
 * tile state (empty/attempted/flash/completed) without leaking raw attempt counts
 * (which the domain rules say are private).
 */
export interface SanitisedLog {
  route_id: string;
  completed: boolean;
  is_flash: boolean;
  has_attempts: boolean;
  zone: boolean;
  grade_vote: number | null;
}

/**
 * Fetch a climber's sanitised logs for the given set. Routes are
 * preloaded by the leaderboard page (identical for every climber), so
 * the sheet only needs the per-user log rows.
 */
export async function fetchClimberSheetLogs(
  climberUserId: string,
  setId: string
): Promise<{ logs: SanitisedLog[] } | { error: string }> {
  if (!UUID_RE.test(climberUserId) || !UUID_RE.test(setId)) {
    return { error: "Invalid request" };
  }

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, gymId } = auth;

  // Verify the set belongs to the caller's gym (prevents cross-gym leak)
  const { data: setRow, error: setError } = await supabase
    .from("sets")
    .select("gym_id")
    .eq("id", setId)
    .maybeSingle();
  if (setError || !setRow || setRow.gym_id !== gymId) {
    return { error: "Set not found" };
  }

  const rawLogs = await getLogsBySetForUser(supabase, setId, climberUserId);

  const logs: SanitisedLog[] = rawLogs.map((l) => ({
    route_id: l.route_id,
    completed: l.completed,
    is_flash: l.completed && l.attempts === 1,
    has_attempts: l.attempts > 0,
    zone: l.zone,
    grade_vote: l.grade_vote,
  }));

  return { logs };
}
