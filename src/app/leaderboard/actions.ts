"use server";

import { requireAuth, requireSameGymScope } from "@/lib/auth";
import { sanitiseLog, type SanitisedLog } from "@/lib/data/logs";
import { getLogsBySetForUser } from "@/lib/data/route-log-queries";
import {
  getLeaderboardCached,
  getLeaderboardTabData,
  type LeaderboardTabData,
} from "@/lib/data/leaderboard-queries";
import { UUID_RE } from "@/lib/validation";
import type { LeaderboardEntry } from "@/lib/data";
import type { ActionResult } from "@/lib/action-result";

const PAGE_LIMIT = 10;

/** Fetch initial data for a tab — top 5, user's row, and neighbourhood. */
export async function fetchLeaderboardTab(
  setId: string | null
): Promise<ActionResult<{ data: LeaderboardTabData }>> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  // requireAuth above guarantees gymId === profile.active_gym_id —
  // the user is implicitly a member, so the cached helpers (which
  // skip the per-call membership check) are safe here. Assembly rule
  // lives in getLeaderboardTabData, shared with the page's first
  // paint.
  const data = await getLeaderboardTabData(supabase, gymId, userId, setId);
  return { success: true, data };
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
): Promise<ActionResult<{ rows: LeaderboardEntry[]; limit: number }>> {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { gymId } = auth;

  // Clamp limit to sensible bounds so a malformed client value can't
  // request the entire board or zero rows.
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await getLeaderboardCached(gymId, setId, safeLimit, offset);
  return { success: true, rows, limit: safeLimit };
}

// The sanitised wire shape and its derivations live beside the rest
// of the per-log privacy grain in `@/lib/data/logs` — re-exported so
// this action module stays the import path its consumers know.
export type { SanitisedLog } from "@/lib/data/logs";

/**
 * Fetch a climber's sanitised logs for the given set. Routes are
 * preloaded by the leaderboard page (identical for every climber), so
 * the sheet only needs the per-user log rows.
 */
export async function fetchClimberSheetLogs(
  climberUserId: string,
  setId: string
): Promise<ActionResult<{ logs: SanitisedLog[] }>> {
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

  const logs: SanitisedLog[] = rawLogs.map(sanitiseLog);

  return { success: true, logs };
}
