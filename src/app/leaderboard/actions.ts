"use server";

import { requireAuth } from "@/lib/auth";
import {
  getLeaderboard,
  getLeaderboardNeighbourhood,
  getLeaderboardUserRow,
  getProfile,
  getRoutesBySet,
  getLogsBySetForUser,
} from "@/lib/data/queries";
import type { LeaderboardEntry, Profile, Route } from "@/lib/data";

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

  const [top, userRow] = await Promise.all([
    getLeaderboard(supabase, gymId, setId, TOP_LIMIT, 0),
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

/** Lazy-load a page of the full leaderboard. */
export async function fetchLeaderboardPage(
  setId: string | null,
  offset: number
): Promise<{ rows: LeaderboardEntry[]; limit: number } | { error: string }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, gymId } = auth;

  const rows = await getLeaderboard(supabase, gymId, setId, PAGE_LIMIT, offset);
  return { rows, limit: PAGE_LIMIT };
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

interface ClimberSheetData {
  profile: Profile;
  routes: Route[];
  logs: SanitisedLog[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fetch a climber's profile + their logs for the given set (for the sheet). */
export async function fetchClimberSheetData(
  climberUserId: string,
  setId: string
): Promise<{ data: ClimberSheetData } | { error: string }> {
  // Input validation — reject malformed UUIDs early
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

  // Verify the target climber is a member of the caller's gym
  const { data: membership } = await supabase
    .from("gym_memberships")
    .select("user_id")
    .eq("user_id", climberUserId)
    .eq("gym_id", gymId)
    .maybeSingle();
  if (!membership) {
    return { error: "Climber not found in this gym" };
  }

  const [profile, routes, rawLogs] = await Promise.all([
    getProfile(supabase, climberUserId),
    getRoutesBySet(supabase, setId),
    getLogsBySetForUser(supabase, setId, climberUserId),
  ]);

  if (!profile) return { error: "Climber not found" };

  const logs: SanitisedLog[] = rawLogs.map((l) => ({
    route_id: l.route_id,
    completed: l.completed,
    is_flash: l.completed && l.attempts === 1,
    has_attempts: l.attempts > 0,
    zone: l.zone,
    grade_vote: l.grade_vote,
  }));

  return { data: { profile, routes, logs } };
}
