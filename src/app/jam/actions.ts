"use server";

import { after } from "next/server";
import { gateSignedInMutation } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { buildBadgeContext } from "@/lib/achievements/context";
import { evaluateAndPersistAchievements } from "@/lib/achievements/evaluate";
import type { JamGradingScale, JamRoute } from "@/lib/data/jam-types";

import { logger } from "@/lib/logger";

// Jam writes go through SECURITY DEFINER RPCs (migrations 041 + 042)
// invoked directly below — is_jam_player / auth.uid() authorisation
// lives at the SQL layer. A pass-through module (jam-mutations.ts)
// used to wrap each RPC call; it was inlined in 2026-08 because every
// wrapper had one caller and an interface as large as its body.

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

function isScale(value: unknown): value is JamGradingScale {
  return (
    value === "v"
    || value === "font"
    || value === "custom"
    || value === "points"
  );
}

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

// ── Create ────────────────────────────────────────

interface CreateJamPayload {
  name?: string | null;
  location?: string | null;
  gradingScale: JamGradingScale;
  minGrade?: number | null;
  maxGrade?: number | null;
  customGrades?: string[] | null;
  saveScaleName?: string | null;
}

export async function createJamAction(
  payload: CreateJamPayload,
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

  if (payload.gradingScale === "v" || payload.gradingScale === "font") {
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
  const auth = await gateSignedInMutation(null, "jam");
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase.rpc("create_jam", {
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
  if (rows.length === 0) return { error: "Could not create the jam." };
  return rows[0];
}

// ── Join ──────────────────────────────────────────

export async function joinJamAction(
  jamId: string,
): Promise<{ error: string } | { ok: true }> {
  const auth = await gateSignedInMutation(jamId, "jam id");
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.rpc("add_jam_player", {
    p_jam_id: jamId,
  });
  if (error) return { error: formatError(error) };
  return { ok: true };
}

export async function leaveJamAction(
  jamId: string,
): Promise<{ error: string } | { ok: true }> {
  const auth = await gateSignedInMutation(jamId, "jam id");
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.rpc("leave_jam", {
    p_jam_id: jamId,
  });
  if (error) return { error: formatError(error) };
  return { ok: true };
}

// ── Routes ────────────────────────────────────────

interface RoutePayload {
  jamId: string;
  description?: string | null;
  grade?: number | null;
  hasZone?: boolean;
}

export async function addJamRouteAction(
  payload: RoutePayload,
): Promise<{ error: string } | { route: JamRoute }> {
  const auth = await gateSignedInMutation(payload.jamId, "jam id");
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase.rpc("add_jam_route", {
    p_jam_id: payload.jamId,
    p_description: undef(clampString(payload.description, MAX_DESCRIPTION_LEN)),
    p_grade: undef(typeof payload.grade === "number" ? payload.grade : null),
    p_has_zone: !!payload.hasZone,
  });
  if (error) return { error: formatError(error) };
  // Return the full row so the client can dispatch `upsert-route`
  // immediately — the jam grid must not wait on the realtime
  // self-echo, which drops often enough for the creator to see a
  // stale list until they refresh.
  return { route: data as JamRoute };
}

interface UpdateRoutePayload {
  routeId: string;
  description?: string | null;
  grade?: number | null;
  hasZone?: boolean;
}

export async function updateJamRouteAction(
  payload: UpdateRoutePayload,
): Promise<{ error: string } | { route: JamRoute }> {
  const auth = await gateSignedInMutation(payload.routeId, "route id");
  if ("error" in auth) return { error: auth.error };
  // No `added_by === userId` check on purpose: jams are intentionally
  // collaborative — any player may edit any route's metadata. The
  // update_jam_route RPC enforces `is_jam_player(jam_id)` at the SQL
  // layer (migrations 041 + 046), which is the correct authorisation
  // for the designed model. Don't add an author gate here without
  // first changing the jam product semantics.
  const { data, error } = await auth.supabase.rpc("update_jam_route", {
    p_route_id: payload.routeId,
    p_description: undef(clampString(payload.description, MAX_DESCRIPTION_LEN)),
    p_grade: undef(typeof payload.grade === "number" ? payload.grade : null),
    p_has_zone: !!payload.hasZone,
  });
  if (error) return { error: formatError(error) };
  return { route: data as JamRoute };
}

// ── Log an attempt ────────────────────────────────

interface UpsertLogPayload {
  jamRouteId: string;
  attempts: number;
  completed: boolean;
  zone: boolean;
}

export async function upsertJamLogAction(
  payload: UpsertLogPayload,
): Promise<{ error: string } | { success: true; log: null }> {
  if (
    typeof payload.attempts !== "number" ||
    payload.attempts < 0 ||
    payload.attempts > 999
  ) {
    return { error: "Invalid attempt count" };
  }
  const auth = await gateSignedInMutation(payload.jamRouteId, "route id");
  if ("error" in auth) return { error: auth.error };
  const { error } = await auth.supabase.rpc("upsert_jam_log", {
    p_jam_route_id: payload.jamRouteId,
    p_attempts: payload.attempts,
    p_completed: !!payload.completed,
    p_zone: !!payload.zone,
  });
  if (error) return { error: formatError(error) };
  // `{ success: true, log: null }` matches the synthetic shape
  // returned by `withOfflineQueue` when the action gets queued,
  // so callers can check `"error" in result` identically for
  // both the online write and the offline-queued replay.
  return { success: true, log: null };
}

// ── End jam ───────────────────────────────────────

export async function endJamAction(
  jamId: string,
): Promise<{ error: string } | { summaryId: string }> {
  const auth = await gateSignedInMutation(jamId, "jam id");
  if ("error" in auth) return { error: auth.error };

  try {
    const { data, error } = await auth.supabase.rpc("end_jam_as_player", {
      p_jam_id: jamId,
    });
    if (error) return { error: formatError(error) };
    const summaryId = data as string;

    // Deferred — everything below is best-effort housekeeping after
    // the jam-end transaction has already committed. If it fails
    // the jam is still ended, the summary is still written; the
    // user just sees their new badges on their next profile visit.
    after(async () => {
      // Achievement re-eval for every participant. Service-role
      // client because we're writing `user_achievements` rows for
      // other users — the evaluator's `evaluateAndPersistAchievements`
      // already does the "don't re-issue earned badges" check.
      const service = createServiceClient();
      const { data: participants, error: participantsError } = await service
        .from("jam_summary_players")
        .select("user_id")
        .eq("jam_summary_id", summaryId);
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
          logger.warn("jam_end_achievement_eval_failed", { err: formatErrorForLog(err) });
        }
      }
    });

    return { summaryId };
  } catch (err) {
    return { error: formatError(err) };
  }
}
