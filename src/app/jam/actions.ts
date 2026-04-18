"use server";

import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";
import {
  createJam,
  joinJam,
  leaveJam,
  addJamRoute,
  updateJamRoute,
  upsertJamLog,
  endJam,
} from "@/lib/data/jam-mutations";
import { buildBadgeContext } from "@/lib/achievements/context";
import { evaluateAndPersistAchievements } from "@/lib/achievements/evaluate";
import type { JamGradingScale } from "@/lib/data/jam-types";

import { logger } from "@/lib/logger";
import { tags } from "@/lib/cache/tags";
const MAX_NAME_LEN = 80;
const MAX_LOCATION_LEN = 120;
const MAX_DESCRIPTION_LEN = 240;
const MAX_CUSTOM_GRADES = 50;
const MAX_SCALE_NAME_LEN = 40;

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

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  try {
    const result = await createJam(auth.supabase, {
      name,
      location,
      gradingScale: payload.gradingScale,
      minGrade,
      maxGrade,
      customGrades,
      saveScaleName,
    });
    return result;
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ── Join ──────────────────────────────────────────

export async function joinJamAction(
  jamId: string,
): Promise<{ error: string } | { ok: true }> {
  if (!UUID_RE.test(jamId)) return { error: "Invalid jam id" };
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  try {
    await joinJam(auth.supabase, jamId);
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function leaveJamAction(
  jamId: string,
): Promise<{ error: string } | { ok: true }> {
  if (!UUID_RE.test(jamId)) return { error: "Invalid jam id" };
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  try {
    await leaveJam(auth.supabase, jamId);
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
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
): Promise<{ error: string } | { id: string }> {
  if (!UUID_RE.test(payload.jamId)) return { error: "Invalid jam id" };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  try {
    const route = await addJamRoute(auth.supabase, {
      jamId: payload.jamId,
      description: clampString(payload.description, MAX_DESCRIPTION_LEN),
      grade: typeof payload.grade === "number" ? payload.grade : null,
      hasZone: !!payload.hasZone,
    });
    return { id: route.id };
  } catch (err) {
    return { error: formatError(err) };
  }
}

interface UpdateRoutePayload {
  routeId: string;
  description?: string | null;
  grade?: number | null;
  hasZone?: boolean;
}

export async function updateJamRouteAction(
  payload: UpdateRoutePayload,
): Promise<{ error: string } | { ok: true }> {
  if (!UUID_RE.test(payload.routeId)) return { error: "Invalid route id" };
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  try {
    await updateJamRoute(auth.supabase, {
      routeId: payload.routeId,
      description: clampString(payload.description, MAX_DESCRIPTION_LEN),
      grade: typeof payload.grade === "number" ? payload.grade : null,
      hasZone: !!payload.hasZone,
    });
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
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
  if (!UUID_RE.test(payload.jamRouteId)) {
    return { error: "Invalid route id" };
  }
  if (
    typeof payload.attempts !== "number" ||
    payload.attempts < 0 ||
    payload.attempts > 999
  ) {
    return { error: "Invalid attempt count" };
  }
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  try {
    await upsertJamLog(auth.supabase, {
      jamRouteId: payload.jamRouteId,
      attempts: payload.attempts,
      completed: !!payload.completed,
      zone: !!payload.zone,
    });
    // `{ success: true, log: null }` matches the synthetic shape
    // returned by `withOfflineQueue` when the action gets queued,
    // so callers can check `"error" in result` identically for
    // both the online write and the offline-queued replay.
    return { success: true, log: null };
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ── End jam ───────────────────────────────────────

export async function endJamAction(
  jamId: string,
): Promise<{ error: string } | { summaryId: string }> {
  if (!UUID_RE.test(jamId)) return { error: "Invalid jam id" };
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  try {
    const summaryId = await endJam(auth.supabase, jamId);

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

      // Revalidate the jam history tag for every participant — every
      // player's `/jam` landing + profile history list needs to pick
      // up the new summary row, not just the caller's.
      for (const userId of userIds) {
        revalidateTag(tags.userJams(userId), "max");
      }

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
