"use server";

import { after } from "next/server";
import { gateSignedInMutation } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { buildBadgeContext } from "@/lib/achievements/context";
import { evaluateAndPersistAchievements } from "@/lib/achievements/evaluate";
import type { MatchGradingScale, MatchRoute } from "@/lib/data/match-types";
import { isDiscipline, type Discipline } from "@/lib/data/grade-label";
import { isUuid } from "@/lib/validation";
import type { Database } from "@/lib/database.types";

type MatchPlayerRow = Database["public"]["Tables"]["set_players"]["Row"];

import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { getMatchStateForUser } from "@/lib/data/match-queries";
import { mintShareToken } from "@/lib/data/shared-result";

// Match writes go through SECURITY DEFINER RPCs (migrations 084-086)
// invoked directly below — is_set_player / auth.uid() authorisation
// lives at the SQL layer. A pass-through module (match-mutations.ts)
// used to wrap each RPC call; it was inlined in 2026-08 because every
// wrapper had one caller and an interface as large as its body.
//
// Two writes deliberately have NO RPC and go straight at the table,
// because RLS already says exactly the right thing and a definer
// function would be a second place to keep that correct:
//
//   • leaving — `set_players_update` is `user_id = auth.uid()` on
//     both sides.
//   • editing a route — `set_routes_update_by_player` (080, given its
//     missing `with check` in 087) permits exactly "a player of this
//     live Match", which is the whole rule.
//
// Logging is NOT one of them, though it looks like it should be: see
// `upsertMatchLogAction` and migration 088 for the one column that
// can't be written correctly from outside the row's own history.

const MAX_NAME_LEN = 80;
const MAX_LOCATION_LEN = 120;
const MAX_DESCRIPTION_LEN = 240;
const MAX_CUSTOM_GRADES = 50;
const MAX_SCALE_NAME_LEN = 40;

// Supabase generates optional RPC parameters as `T | undefined`
// rather than `T | null`. Our domain layer models "absent" as `null`
// (matches Postgres semantics everywhere else), so fold null →
// undefined once at the RPC boundary.
function undef<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function isScale(value: unknown): value is MatchGradingScale {
  return (
    value === "v"
    || value === "font"
    || value === "yds"
    || value === "french"
    || value === "custom"
    || value === "points"
  );
}

/**
 * Scales that map a numeric grade through a fixed sequence, and so
 * take a min/max range. `custom` carries its own ladder and `points`
 * has no grades at all.
 */
function isFormulaScale(scale: MatchGradingScale): boolean {
  return (
    scale === "v" || scale === "font" || scale === "yds" || scale === "french"
  );
}

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

// ── Create ────────────────────────────────────────

interface CreateMatchPayload {
  name?: string | null;
  location?: string | null;
  gradingScale: MatchGradingScale;
  minGrade?: number | null;
  maxGrade?: number | null;
  customGrades?: string[] | null;
  saveScaleName?: string | null;
  /** Default for the Match's routes; each may override. */
  discipline?: Discipline | null;
  /** Score relative to each player's ceiling. Needs a graded scale. */
  handicap?: boolean;
}

export async function createMatchAction(
  payload: CreateMatchPayload,
): Promise<{ error: string } | { id: string; code: string }> {
  if (!isScale(payload.gradingScale)) {
    return { error: "Invalid grading scale" };
  }

  const name = clampString(payload.name, MAX_NAME_LEN);
  const location = clampString(payload.location, MAX_LOCATION_LEN);

  let minGrade: number | null = null;
  let maxGrade: number | null = null;
  let customGrades: string[] | null = null;
  let saveScaleName: string | null = null;

  if (isFormulaScale(payload.gradingScale)) {
    if (
      typeof payload.minGrade !== "number" ||
      typeof payload.maxGrade !== "number"
    ) {
      return { error: "Pick a min and max grade" };
    }
    if (payload.minGrade < 0 || payload.minGrade > 30) {
      return { error: "Min grade out of range" };
    }
    if (payload.maxGrade < payload.minGrade || payload.maxGrade > 30) {
      return { error: "Max grade must be above min and ≤ 30" };
    }
    minGrade = payload.minGrade;
    maxGrade = payload.maxGrade;
  } else if (payload.gradingScale === "custom") {
    if (!Array.isArray(payload.customGrades) || payload.customGrades.length === 0) {
      return { error: "Add at least one custom grade" };
    }
    if (payload.customGrades.length > MAX_CUSTOM_GRADES) {
      return { error: `Max ${MAX_CUSTOM_GRADES} grades` };
    }
    const normalised: string[] = [];
    for (const raw of payload.customGrades) {
      const label = clampString(raw, MAX_SCALE_NAME_LEN);
      if (!label) return { error: "Each grade needs a label" };
      normalised.push(label);
    }
    customGrades = normalised;
    saveScaleName = clampString(payload.saveScaleName, MAX_SCALE_NAME_LEN);
  }
  // `points` falls through — no grades, no range, nothing to validate.

  // No resource id to validate (the payload was validated above) —
  // the gate still supplies signed-in auth + the write rate limit.
  const auth = await gateSignedInMutation(null, "match");
  if ("error" in auth) return { error: auth.error };

  const discipline = payload.discipline ?? "boulder";
  if (!isDiscipline(discipline)) return { error: "Invalid discipline" };

  const { data, error } = await auth.supabase.rpc("create_match", {
    p_discipline: discipline,
    p_handicap: !!payload.handicap,
    p_name: undef(name),
    p_location: undef(location),
    p_grading_scale: payload.gradingScale,
    p_min_grade: undef(minGrade),
    p_max_grade: undef(maxGrade),
    p_custom_grades: undef(customGrades),
    p_save_scale_name: undef(saveScaleName),
  });
  if (error) return { error: formatError(error) };
  const rows = (data ?? []) as Array<{ id: string; code: string }>;
  if (rows.length === 0) return { error: "Could not create the match." };
  return rows[0];
}

// ── Join ──────────────────────────────────────────

export async function joinMatchAction(
  matchId: string,
): Promise<{ error: string } | { ok: true }> {
  const auth = await gateSignedInMutation(matchId, "match id");
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.rpc("join_match", {
    p_set_id: matchId,
  });
  if (error) return { error: formatError(error) };
  return { ok: true };
}

/**
 * Leaving parks the row rather than deleting it — the same reasoning
 * as gym memberships (see CLAUDE.md): `route_logs` SELECT is gated on
 * being a player, so removing the row would make the climber's own
 * history in that Match unreadable to them.
 *
 * No RPC: `set_players_update` (migration 080) is `user_id =
 * auth.uid()` on both sides, which is exactly the rule.
 */
export async function leaveMatchAction(
  matchId: string,
): Promise<{ error: string } | { ok: true }> {
  const auth = await gateSignedInMutation(matchId, "match id");
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase
    .from("set_players")
    .update({ left_at: new Date().toISOString() })
    .eq("set_id", matchId)
    .eq("user_id", auth.userId)
    .is("left_at", null);
  if (error) return { error: formatError(error) };
  return { ok: true };
}

// ── Routes ────────────────────────────────────────

interface RoutePayload {
  matchId: string;
  description?: string | null;
  grade?: number | null;
  hasZone?: boolean;
  /**
   * Overrides the Match's discipline for this route — the outdoor
   * "boulders and ropes in one session" case. Omit to inherit; the
   * RPC also normalises a value equal to the Match's own back to
   * null, so inheriting stays inheriting.
   */
  discipline?: Discipline | null;
}

export async function addMatchRouteAction(
  payload: RoutePayload,
): Promise<{ error: string } | { route: MatchRoute }> {
  const auth = await gateSignedInMutation(payload.matchId, "match id");
  if ("error" in auth) return { error: auth.error };

  if (payload.discipline != null && !isDiscipline(payload.discipline)) {
    return { error: "Invalid discipline" };
  }

  const { data, error } = await auth.supabase.rpc("add_match_route", {
    p_discipline: undef(payload.discipline),
    p_set_id: payload.matchId,
    p_description: undef(clampString(payload.description, MAX_DESCRIPTION_LEN)),
    p_grade: undef(typeof payload.grade === "number" ? payload.grade : null),
    p_has_zone: !!payload.hasZone,
  });
  if (error) return { error: formatError(error) };
  // Return the full row so the client can dispatch `upsert-route`
  // immediately — the match grid must not wait on the realtime
  // self-echo, which drops often enough for the creator to see a
  // stale list until they refresh.
  return { route: data as MatchRoute };
}

interface UpdateRoutePayload {
  routeId: string;
  description?: string | null;
  grade?: number | null;
  hasZone?: boolean;
  /**
   * Overrides the Match's discipline. A value equal to the Match's own
   * is normalised back to null by a trigger (migration 093), so
   * "inherit" survives an edit — the same rule the add RPC applies.
   */
  discipline?: Discipline | null;
}

export async function updateMatchRouteAction(
  payload: UpdateRoutePayload,
): Promise<{ error: string } | { route: MatchRoute }> {
  if (payload.discipline != null && !isDiscipline(payload.discipline)) {
    return { error: "Invalid discipline" };
  }
  const auth = await gateSignedInMutation(payload.routeId, "route id");
  if ("error" in auth) return { error: auth.error };
  // No `added_by === userId` check on purpose: Matches are
  // intentionally collaborative — any player may edit any route's
  // metadata. `set_routes_update_by_player` enforces "a player of this
  // live Match" on both the row being touched and the row it becomes
  // (migration 080, `with check` added in 087), which is the correct
  // authorisation for the designed model. Don't add an author gate
  // here without first changing the Match product semantics.
  //
  // The column list is closed on purpose: `set_id` and `number` are
  // not editable, so an edit can't move a route between Sets or
  // collide with another route's number.
  const { data, error } = await auth.supabase
    .from("routes")
    .update({
      description: clampString(payload.description, MAX_DESCRIPTION_LEN),
      declared_grade: typeof payload.grade === "number" ? payload.grade : null,
      has_zone: !!payload.hasZone,
      discipline: payload.discipline ?? null,
    })
    .eq("id", payload.routeId)
    .select("*")
    .maybeSingle();
  if (error) return { error: formatError(error) };
  // RLS filtered every row out — not a player, or the Match has ended.
  if (!data) return { error: "You can't edit that route." };
  return { route: data as MatchRoute };
}

// ── Guests ────────────────────────────────────────

const MAX_GUEST_NAME_LEN = 40;

/**
 * Seat a guest: a named player with no account, whose sends the host
 * enters. See CONTEXT.md "Guest players".
 *
 * No RPC — `set_players_insert` (migration 095) already permits
 * exactly "the host of this live Match, seating a nameless-account
 * row", which is the whole rule. RLS filtering every row out is what
 * a non-host gets.
 */
export async function addMatchGuestAction(
  matchId: string,
  name: string,
): Promise<{ error: string } | { player: MatchPlayerRow }> {
  const auth = await gateSignedInMutation(matchId, "match id");
  if ("error" in auth) return { error: auth.error };

  const displayName = clampString(name, MAX_GUEST_NAME_LEN);
  if (!displayName) return { error: "Give them a name" };

  const { data, error } = await auth.supabase
    .from("set_players")
    .insert({ set_id: matchId, user_id: null, display_name: displayName })
    .select("*")
    .maybeSingle();
  if (error) return { error: formatError(error) };
  if (!data) return { error: "Only the host can add a guest." };
  return { player: data as MatchPlayerRow };
}

/**
 * Remove a guest. Parks the seat rather than deleting it, exactly as
 * a real player leaving does — their logs stay readable and the
 * result they were part of doesn't silently change shape afterwards.
 */
export async function removeMatchGuestAction(
  playerId: string,
): Promise<{ error: string } | { ok: true }> {
  const auth = await gateSignedInMutation(playerId, "player id");
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("set_players")
    .update({ left_at: new Date().toISOString() })
    .eq("id", playerId)
    .is("user_id", null)
    .is("left_at", null);
  if (error) return { error: formatError(error) };
  return { ok: true };
}

/**
 * Declare a player's ceiling for the handicap, in this Match's scale.
 *
 * Your own seat, or a guest's if you host — the same split as
 * logging. An account-backed player declares their own limit, or the
 * handicap becomes something done TO them.
 */
export async function setMatchCeilingAction(
  matchId: string,
  playerId: string,
  ceiling: number | null,
): Promise<{ error: string } | { ok: true }> {
  const auth = await gateSignedInMutation(playerId, "player id");
  if ("error" in auth) return { error: auth.error };
  if (!isUuid(matchId)) return { error: "Invalid match id" };
  if (
    ceiling !== null
    && (!Number.isInteger(ceiling) || ceiling < 0 || ceiling > 30)
  ) {
    return { error: "Ceiling out of range" };
  }

  const { error } = await auth.supabase.rpc("set_match_ceiling", {
    p_set_id: matchId,
    p_player_id: playerId,
    // Generated as `number | undefined`; our domain models "no
    // ceiling declared" as null, so fold it at the RPC boundary the
    // same way `undef` does elsewhere.
    p_ceiling: ceiling ?? undefined,
  });
  if (error) return { error: formatError(error) };
  return { ok: true };
}

/** Turn the handicap on or off. Host only, while the Match is live. */
export async function setMatchHandicapAction(
  matchId: string,
  enabled: boolean,
): Promise<{ error: string } | { ok: true }> {
  const auth = await gateSignedInMutation(matchId, "match id");
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase.rpc("set_match_handicap", {
    p_set_id: matchId,
    p_enabled: enabled,
  });
  if (error) return { error: formatError(error) };
  return { ok: true };
}

// ── Log an attempt ────────────────────────────────

interface UpsertLogPayload {
  matchRouteId: string;
  attempts: number;
  completed: boolean;
  zone: boolean;
  /**
   * Log for a GUEST seat instead of yourself. Host-only, enforced in
   * SQL — a guest has no session, so the host is the only person who
   * could be entering this.
   */
  playerId?: string | null;
}

export async function upsertMatchLogAction(
  payload: UpsertLogPayload,
): Promise<{ error: string } | { success: true; log: null }> {
  if (
    typeof payload.attempts !== "number" ||
    payload.attempts < 0 ||
    payload.attempts > 999
  ) {
    return { error: "Invalid attempt count" };
  }
  const auth = await gateSignedInMutation(payload.matchRouteId, "route id");
  if ("error" in auth) return { error: auth.error };
  // A Match log is an ordinary `route_logs` row — same table, same
  // policies, same `compute_points`. It goes through an RPC for one
  // column: `completed_at` must survive a re-tap of an already-sent
  // route, and a plain upsert can't express "leave it as it was".
  // Restamping it would reorder tied climbers, since `last_send_at`
  // is the board's fourth tiebreak. See migration 088.
  if (payload.playerId != null && !isUuid(payload.playerId)) {
    return { error: "Invalid player" };
  }

  const { error } = await auth.supabase.rpc("upsert_match_log", {
    p_route_id: payload.matchRouteId,
    p_attempts: payload.attempts,
    p_completed: !!payload.completed,
    p_zone: !!payload.zone,
    p_player_id: undef(payload.playerId),
  });
  if (error) return { error: formatError(error) };
  // `{ success: true, log: null }` matches the synthetic shape
  // returned by `withOfflineQueue` when the action gets queued,
  // so callers can check `"error" in result` identically for
  // both the online write and the offline-queued replay.
  return { success: true, log: null };
}

// ── End match ───────────────────────────────────────

/**
 * End a Match.
 *
 * Returns the SET id, not a summary id — there is no summary. A Match
 * is a Set and Sets keep their rows, so ending one archives it and the
 * result page reads the same rows the live board did. That is what
 * removed `end_match` (110 lines of aggregate-then-delete) and with it
 * the `row_number()`/`dense_rank()` tie disagreement between a match's
 * board and its own summary.
 */
export async function endMatchAction(
  matchId: string,
): Promise<{ error: string } | { summaryId: string }> {
  const auth = await gateSignedInMutation(matchId, "match id");
  if ("error" in auth) return { error: auth.error };

  try {
    const { error } = await auth.supabase.rpc("end_match", {
      p_set_id: matchId,
    });
    if (error) return { error: formatError(error) };
    const summaryId = matchId;

    // Deferred — everything below is best-effort housekeeping after
    // the end transaction has already committed. If it fails the
    // Match is still ended; the user just sees their new badges on
    // their next profile visit.
    after(async () => {
      // Achievement re-eval for every participant. Service-role
      // client because we're writing `user_achievements` rows for
      // other users — the evaluator's `evaluateAndPersistAchievements`
      // already does the "don't re-issue earned badges" check.
      const service = createServiceClient();
      const { data: participants, error: participantsError } = await service
        .from("set_players")
        .select("user_id")
        .eq("set_id", matchId)
        .is("left_at", null);
      if (participantsError || !participants) return;

      const userIds = participants
        .map((p) => p.user_id)
        .filter((id): id is string => id !== null);
      if (userIds.length === 0) return;

      // Batch profile read — one trip for every participant's gym.
      const { data: profiles } = await service
        .from("profiles")
        .select("id, active_gym_id")
        .in("id", userIds);
      const gymByUserId = new Map<string, string | null>();
      for (const p of profiles ?? []) {
        gymByUserId.set(p.id, p.active_gym_id ?? null);
      }

      // Evaluate sequentially — keeps DB load bounded and matches
      // the pattern used elsewhere for post-mutation work.
      for (const userId of userIds) {
        try {
          const gymId = gymByUserId.get(userId) ?? null;
          const ctx = await buildBadgeContext(service, userId, gymId);
          if (!ctx) continue;
          await evaluateAndPersistAchievements(service, userId, ctx);
        } catch (err) {
          // Per-user evaluation failures must not block the rest.
          logger.warn("match_end_achievement_eval_failed", { err: formatErrorForLog(err) });
        }
      }
    });

    return { summaryId };
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ── Share a finished result ───────────────────────

/**
 * Mint (or re-fetch) the public link for a finished Match result.
 *
 * Authorisation is `getMatchStateForUser`, the same participant gate the
 * result page uses — it returns null for anyone who wasn't there, and
 * that null is the whole check. Deliberately not a second bespoke
 * gate: one audited path, not two that must agree.
 *
 * Idempotent by construction (see `mintShareToken`), so a result has
 * one canonical URL however many people share it.
 */
export async function shareResultAction(
  summaryId: string,
): Promise<{ error: string } | { url: string }> {
  const auth = await gateSignedInMutation(summaryId, "result");
  if ("error" in auth) return { error: auth.error };

  const service = createServiceClient();
  const state = await getMatchStateForUser(service, summaryId, auth.userId);
  // Null = not found OR not a participant. Collapsed on purpose so a
  // guessed id can't distinguish the two.
  if (!state) return { error: "Result not found." };

  const token = await mintShareToken(summaryId);
  if (!token) return { error: "Couldn't create a share link — try again." };

  return { url: `${env.SITE_URL}/r/${token}` };
}
