"use server";

import { requireAuth, requireSameGymScope } from "@/lib/auth";
import { getLogsBySetForUser } from "@/lib/data/route-log-queries";
import {
  getLeaderboardCached,
  getLeaderboardTabData,
  type LeaderboardTabData,
} from "@/lib/data/leaderboard-queries";
import { UUID_RE } from "@/lib/validation";
import type { LeaderboardEntry } from "@/lib/data";

const PAGE_LIMIT = 10;

/** Fetch initial data for a tab — top 5, user's row, and neighbourhood. */
export async function fetchLeaderboardTab(
  setId: string | null
): Promise<{ data: LeaderboardTabData } | { error: string }> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  // requireAuth above guarantees gymId === profile.active_gym_id —
  // the user is implicitly a member, so the cached helpers (which
  // skip the per-call membership check) are safe here. Assembly rule
  // lives in getLeaderboardTabData, shared with the page's first
  // paint.
  const data = await getLeaderboardTabData(supabase, gymId, userId, setId);
  return { data };
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

  // Cross-gym scope gate — set belongs to caller's gym AND target is
  // a member of it. One auditable home in auth.ts, shared with
  // fetchSetPlacement (u/[username]/actions.ts).
  const scope = await requireSameGymScope(supabase, gymId, setId, climberUserId);
  if ("error" in scope) return { error: scope.error };

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
