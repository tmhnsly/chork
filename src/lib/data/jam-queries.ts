// Match reads. All go through Postgres RPCs (migrations 084–086) —
// no client-side aggregation, no raw row joins.
//
// Errors swallow + log + fall back to neutral values (null / []) to
// match the read contract in `docs/architecture.md`. Callers render
// "absent" the same as "failed" so no try/catch is needed upstream.
//
// Several of these are **service-role only**, because they take their
// subject as an argument rather than reading `auth.uid()`. That is
// deliberate on two counts: a client must not be able to ask about
// someone else, and reading `auth.uid()` inside a SECURITY DEFINER
// body flaked under stale JWTs on SSR (it silently treated the caller
// as a stranger — see the `getJamState` → `getJamStateForUser` note in
// migration 048). Auth happens at the Next page level first.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { formatErrorForLog } from "../errors";
import { JAM_CODE_RE } from "../validation";
import type {
  ActiveJamSummary,
  JamAchievementContext,
  JamHistoryRow,
  JamState,
  JoinJamLookup,
  SavedScale,
} from "./jam-types";

import { logger } from "@/lib/logger";
import { asJsonShape, asJsonShapeArray } from "./json-shape";
import { readSingle, readMany } from "./read";
type Client = SupabaseClient<Database>;

/**
 * The resume banner's "you're in a Match right now". Service-role;
 * pass the caller's own id after `requireSignedIn`.
 */
export async function getActiveJamForUserById(
  service: Client,
  userId: string,
): Promise<ActiveJamSummary | null> {
  return readSingle<ActiveJamSummary>(
    service.rpc("get_active_match_for_user", { p_user_id: userId }),
    "getactivematchforuser_failed",
  );
}

/**
 * The whole room for one viewer: Match, grades, routes, players, the
 * caller's own logs, and the board. Non-players resolve to null and
 * the caller redirects.
 *
 * Also serves a finished Match — the result page reads the same rows
 * the live board does, which is the point of the convergence. There
 * is no separate summary to hydrate.
 */
export async function getJamStateForUser(
  service: Client,
  setId: string,
  userId: string,
): Promise<JamState | null> {
  const { data, error } = await service.rpc("get_match_state_for_user", {
    p_set_id: setId,
    p_user_id: userId,
  });
  if (error) {
    logger.warn("getmatchstateforuser_failed", { err: formatErrorForLog(error) });
    return null;
  }
  return data == null ? null : asJsonShape<JamState>(data);
}

/**
 * Pre-join preview. Runs on the caller's own client — the code IS the
 * invitation, and you cannot be a player yet, so this is the one Match
 * read that isn't membership-gated.
 */
export async function lookupJamByCode(
  supabase: Client,
  code: string,
): Promise<JoinJamLookup | null> {
  const normalised = code.trim().toUpperCase();
  if (!JAM_CODE_RE.test(normalised)) return null;
  return readSingle<JoinJamLookup>(
    supabase.rpc("lookup_match_by_code", { p_code: normalised }),
    "lookupmatchbycode_failed",
  );
}

/** Finished Matches the user played, newest first. Service-role. */
export async function getUserJams(
  service: Client,
  userId: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<JamHistoryRow[]> {
  const { limit = 20, before = null } = options;
  return readMany<JamHistoryRow>(
    service.rpc("get_match_history", {
      p_user_id: userId,
      p_limit: limit,
      // `p_before` is `timestamptz default null` server-side; the
      // generated type models it as `string | undefined`, so fold
      // our domain `null` through to match.
      p_before: before ?? undefined,
    }),
    "getmatchhistory_failed",
  );
}

export async function getUserSavedScales(
  supabase: Client,
): Promise<SavedScale[]> {
  const { data, error } = await supabase.rpc("get_user_saved_scales");
  if (error) {
    logger.warn("getusersavedscales_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return asJsonShapeArray<SavedScale>(data);
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

/**
 * Badge context. Service-role.
 *
 * The RPC speaks `match_*`; the badge engine and every stored
 * achievement key still speak `jam_*`. Mapping here rather than
 * renaming outward keeps this change a data-source swap — the badge
 * rename rides along with the code rename later, where it can be done
 * with the persisted `user_achievements` rows in view.
 */
export async function getJamAchievementContext(
  service: Client,
  userId: string,
): Promise<JamAchievementContext> {
  const row = await readSingle<{
    matches_played: number;
    matches_won: number;
    matches_hosted: number;
    max_players_in_won_match: number;
    unique_coplayers: number;
    max_iron_crew_pair_count: number;
    match_total_flashes: number;
    match_total_sends: number;
    match_total_points: number;
  }>(
    service.rpc("get_match_achievement_context", { p_user_id: userId }),
    "getmatchachievementcontext_failed",
  );
  if (!row) return emptyJamAchievementContext();
  return {
    jams_played: row.matches_played,
    jams_won: row.matches_won,
    jams_hosted: row.matches_hosted,
    max_players_in_won_jam: row.max_players_in_won_match,
    unique_coplayers: row.unique_coplayers,
    max_iron_crew_pair_count: row.max_iron_crew_pair_count,
    jam_total_flashes: row.match_total_flashes,
    jam_total_sends: row.match_total_sends,
    jam_total_points: row.match_total_points,
  };
}
