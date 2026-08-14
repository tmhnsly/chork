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
// as a stranger — see the `getMatchState` → `getMatchStateForUser` note in
// migration 048). Auth happens at the Next page level first.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { formatErrorForLog } from "../errors";
import { MATCH_CODE_RE } from "../validation";
import type {
  ActiveMatchSummary,
  MatchAchievementContext,
  MatchHistoryRow,
  MatchState,
  JoinMatchLookup,
  SavedScale,
} from "./match-types";

import { logger } from "@/lib/logger";
import { asJsonShape, asJsonShapeArray } from "./json-shape";
import { readSingle, readMany } from "./read";
type Client = SupabaseClient<Database>;

/**
 * The resume banner's "you're in a Match right now". Service-role;
 * pass the caller's own id after `requireSignedIn`.
 */
export async function getActiveMatchForUserById(
  service: Client,
  userId: string,
): Promise<ActiveMatchSummary | null> {
  return readSingle<ActiveMatchSummary>(
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
export async function getMatchStateForUser(
  service: Client,
  setId: string,
  userId: string,
): Promise<MatchState | null> {
  const { data, error } = await service.rpc("get_match_state_for_user", {
    p_set_id: setId,
    p_user_id: userId,
  });
  if (error) {
    logger.warn("getmatchstateforuser_failed", { err: formatErrorForLog(error) });
    return null;
  }
  return data == null ? null : asJsonShape<MatchState>(data);
}

/**
 * Pre-join preview. Runs on the caller's own client — the code IS the
 * invitation, and you cannot be a player yet, so this is the one Match
 * read that isn't membership-gated.
 */
export async function lookupMatchByCode(
  supabase: Client,
  code: string,
): Promise<JoinMatchLookup | null> {
  const normalised = code.trim().toUpperCase();
  if (!MATCH_CODE_RE.test(normalised)) return null;
  return readSingle<JoinMatchLookup>(
    supabase.rpc("lookup_match_by_code", { p_code: normalised }),
    "lookupmatchbycode_failed",
  );
}

/** Finished Matches the user played, newest first. Service-role. */
export async function getUserMatches(
  service: Client,
  userId: string,
  options: { limit?: number; before?: string | null } = {},
): Promise<MatchHistoryRow[]> {
  const { limit = 20, before = null } = options;
  return readMany<MatchHistoryRow>(
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
function emptyMatchAchievementContext(): MatchAchievementContext {
  return {
    matches_played: 0,
    matches_won: 0,
    matches_hosted: 0,
    max_players_in_won_match: 0,
    unique_coplayers: 0,
    max_iron_crew_pair_count: 0,
    match_total_flashes: 0,
    match_total_sends: 0,
    match_total_points: 0,
  };
}

/**
 * Badge context. Service-role.
 *
 * `MatchAchievementContext` is the RPC's return shape column-for-
 * column, so there is nothing to map — during the convergence this
 * function held a field-by-field translation from the RPC's `match_*`
 * names to the badge engine's then-`jam_*` ones, and the rename made
 * both sides agree. If they ever diverge again, translate here rather
 * than teaching the badge engine two vocabularies.
 */
export async function getMatchAchievementContext(
  service: Client,
  userId: string,
): Promise<MatchAchievementContext> {
  const row = await readSingle<MatchAchievementContext>(
    service.rpc("get_match_achievement_context", { p_user_id: userId }),
    "getmatchachievementcontext_failed",
  );
  return row ?? emptyMatchAchievementContext();
}
