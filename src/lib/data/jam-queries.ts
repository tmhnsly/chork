// Jam reads. All go through Postgres RPCs defined in migrations
// 041 + 042 — no client-side aggregation, no raw row joins.
//
// Errors swallow + log + fall back to neutral values (null / []) to
// match the read contract in `docs/architecture.md`. Callers render
// "absent" the same as "failed" so no try/catch is needed upstream.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { formatErrorForLog } from "../errors";
import type {
  ActiveJamSummary,
  JamAchievementContext,
  JamHistoryRow,
  JamState,
  JamSummaryBundle,
  JoinJamLookup,
  SavedScale,
  UserAllTimeStats,
} from "./jam-types";

type Client = SupabaseClient<Database>;

export async function getJamState(
  supabase: Client,
  jamId: string,
): Promise<JamState | null> {
  const { data, error } = await supabase.rpc("get_jam_state", {
    p_jam_id: jamId,
  });
  if (error) {
    console.warn("[chork] getJamState failed:", formatErrorForLog(error));
    return null;
  }
  // The RPC returns jsonb — cast through unknown so callers get the
  // typed payload without pattern-matching the raw jsonb at every
  // call site.
  return (data ?? null) as unknown as JamState | null;
}

export async function getActiveJamForUser(
  supabase: Client,
): Promise<ActiveJamSummary | null> {
  const { data, error } = await supabase.rpc("get_active_jam_for_user");
  if (error) {
    console.warn("[chork] getActiveJamForUser failed:", formatErrorForLog(error));
    return null;
  }
  const rows = (data ?? []) as ActiveJamSummary[];
  return rows[0] ?? null;
}

export async function lookupJamByCode(
  supabase: Client,
  code: string,
): Promise<JoinJamLookup | null> {
  const normalised = code.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalised)) return null;
  const { data, error } = await supabase.rpc("join_jam_by_code", {
    p_code: normalised,
  });
  if (error) {
    console.warn("[chork] lookupJamByCode failed:", formatErrorForLog(error));
    return null;
  }
  const rows = (data ?? []) as JoinJamLookup[];
  return rows[0] ?? null;
}

export async function getUserJams(
  supabase: Client,
  userId: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<JamHistoryRow[]> {
  const { limit = 20, before = null } = options;
  const { data, error } = await supabase.rpc("get_user_jams", {
    p_user_id: userId,
    p_limit: limit,
    // `p_before` is `timestamptz default null` server-side; the
    // generated type models it as `string | undefined`, so fold
    // our domain `null` through to match.
    p_before: before ?? undefined,
  });
  if (error) {
    console.warn("[chork] getUserJams failed:", formatErrorForLog(error));
    return [];
  }
  return (data ?? []) as JamHistoryRow[];
}

export async function getJamSummaryBundle(
  supabase: Client,
  summaryId: string,
): Promise<JamSummaryBundle | null> {
  const { data, error } = await supabase.rpc("get_jam_summary", {
    p_summary_id: summaryId,
  });
  if (error) {
    console.warn("[chork] getJamSummaryBundle failed:", formatErrorForLog(error));
    return null;
  }
  return (data ?? null) as unknown as JamSummaryBundle | null;
}

export async function getUserSavedScales(
  supabase: Client,
): Promise<SavedScale[]> {
  const { data, error } = await supabase.rpc("get_user_saved_scales");
  if (error) {
    console.warn("[chork] getUserSavedScales failed:", formatErrorForLog(error));
    return [];
  }
  return (data ?? []) as unknown as SavedScale[];
}

export async function getUserAllTimeStats(
  supabase: Client,
  userId: string,
): Promise<UserAllTimeStats | null> {
  const { data, error } = await supabase.rpc("get_user_all_time_stats", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("[chork] getUserAllTimeStats failed:", formatErrorForLog(error));
    return null;
  }
  const rows = (data ?? []) as UserAllTimeStats[];
  return rows[0] ?? null;
}

// Neutral default used whenever the RPC fails or returns no rows.
// Keeps the caller interface simple — always a populated context,
// never a null guard at every call site.
function emptyJamAchievementContext(): JamAchievementContext {
  return {
    jams_played: 0,
    jams_won: 0,
    jams_hosted: 0,
    max_players_in_won_jam: 0,
    unique_coplayers: 0,
    max_iron_crew_pair_count: 0,
    jam_total_flashes: 0,
    jam_total_sends: 0,
    jam_total_points: 0,
  };
}

export async function getJamAchievementContext(
  supabase: Client,
  userId: string,
): Promise<JamAchievementContext> {
  const { data, error } = await supabase.rpc("get_jam_achievement_context", {
    p_user_id: userId,
  });
  if (error) {
    console.warn(
      "[chork] getJamAchievementContext failed:",
      formatErrorForLog(error),
    );
    return emptyJamAchievementContext();
  }
  const rows = (data ?? []) as JamAchievementContext[];
  return rows[0] ?? emptyJamAchievementContext();
}
