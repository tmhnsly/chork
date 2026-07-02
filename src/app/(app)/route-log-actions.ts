"use server";

import { revalidateTag } from "next/cache";
import { revalidateRouteLogTags } from "@/lib/cache/revalidate";
import { gateClimberMutation } from "@/lib/auth";
import {
  upsertRouteLog,
  createActivityEvent,
  deleteCompletionEvents,
} from "@/lib/data/mutations";
import type { RouteLog, ActivityEventType } from "@/lib/data";
import { formatError } from "@/lib/errors";
import { UUID_RE, isValidGradeVote } from "@/lib/validation";
import { isFlash } from "@/lib/data/logs";
import { buildBadgeContext } from "@/lib/achievements/context";
import { evaluateAndPersistAchievements } from "@/lib/achievements/evaluate";
import type { BadgeDefinition } from "@/lib/badges";
import { tags } from "@/lib/cache/tags";
import type { ActionResult } from "@/lib/action-result";

type LogResult = ActionResult<{ log: RouteLog; earnedBadges?: BadgeDefinition[] }>;

export async function updateAttempts(
  routeId: string,
  attempts: number,
  logId?: string
): Promise<LogResult> {
  if (logId !== undefined && !UUID_RE.test(logId)) return { error: "Invalid log" };
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 999) return { error: "Invalid attempts" };
  const gate = await gateClimberMutation(routeId, "route");
  if ("error" in gate) return gate;
  const { supabase, userId, gymId } = gate;

  try {
    const log = await upsertRouteLog(supabase, userId, routeId, { attempts }, logId, gymId);
    // No revalidatePath — attempts are frequent, optimistic UI handles it.
    // Completion/uncompletion revalidate instead.
    return { success: true, log };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function completeRoute(
  routeId: string,
  attempts: number,
  gradeVote: number | null,
  zone: boolean,
  logId?: string
): Promise<LogResult> {
  if (logId !== undefined && !UUID_RE.test(logId)) return { error: "Invalid log" };
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 999) return { error: "Invalid attempts" };
  if (!isValidGradeVote(gradeVote)) return { error: "Invalid grade" };
  const gate = await gateClimberMutation(routeId, "route");
  if ("error" in gate) return gate;
  const { supabase, userId, gymId } = gate;

  const flashed = isFlash({ attempts, completed: true });

  try {
    const eventType: ActivityEventType = flashed ? "flashed" : "completed";
    const [log] = await Promise.all([
      upsertRouteLog(supabase, userId, routeId, {
        attempts,
        completed: true,
        completed_at: new Date().toISOString(),
        grade_vote: gradeVote,
        zone,
      }, logId, gymId),
      createActivityEvent(supabase, {
        user_id: userId,
        route_id: routeId,
        type: eventType,
        gym_id: gymId,
      }),
    ]);

    // upsertRouteLog joined routes for us — no extra round trip needed.
    revalidateRouteLogTags(log.set_id, userId);
    // No profile-row bust: a send doesn't change profiles.* fields.
    // user_set_stats does change (via trigger) but that's read by
    // getProfileSummary which isn't server-cached.

    // Inline badge evaluation so the result can carry any newly-earned
    // achievements straight to the client toast. Buying ~150-250ms of
    // additional response time vs. a deferred after() pass is worth it
    // — without the diff in the same response, the celebratory toast
    // would either never fire or arrive on the next page load,
    // disconnected from the send that earned it.
    //
    // evaluateAndPersistAchievements catches every error path
    // internally and returns [] on failure, so a flaky badge query
    // can never propagate up and turn a successful send into an
    // error response.
    let earnedBadges: BadgeDefinition[] = [];
    try {
      const ctx = await buildBadgeContext(supabase, userId, gymId);
      if (ctx) {
        earnedBadges = await evaluateAndPersistAchievements(supabase, userId, ctx);
      }
    } catch (err) {
      console.error("[achievements] post-send evaluation failed", err);
    }

    return {
      success: true,
      log,
      ...(earnedBadges.length > 0 ? { earnedBadges } : {}),
    };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function uncompleteRoute(
  routeId: string,
  logId?: string
): Promise<LogResult> {
  if (logId !== undefined && !UUID_RE.test(logId)) return { error: "Invalid log" };
  const gate = await gateClimberMutation(routeId, "route");
  if ("error" in gate) return gate;
  const { supabase, userId, gymId } = gate;

  try {
    const [log] = await Promise.all([
      upsertRouteLog(supabase, userId, routeId, {
        completed: false,
        completed_at: null,
        grade_vote: null,
      }, logId, gymId),
      deleteCompletionEvents(supabase, userId, routeId, gymId),
    ]);

    revalidateRouteLogTags(log.set_id, userId);
    // No profile-row bust — see completeRoute note.

    return { success: true, log };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function toggleZone(
  routeId: string,
  zone: boolean,
  logId?: string
): Promise<LogResult> {
  if (logId !== undefined && !UUID_RE.test(logId)) return { error: "Invalid log" };
  const gate = await gateClimberMutation(routeId, "route");
  if ("error" in gate) return gate;
  const { supabase, userId, gymId } = gate;

  try {
    const log = await upsertRouteLog(supabase, userId, routeId, { zone }, logId, gymId);
    // No revalidatePath — zone toggle is frequent, optimistic UI handles it.
    return { success: true, log };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function updateGradeVote(
  routeId: string,
  gradeVote: number | null,
  logId: string
): Promise<LogResult> {
  if (!UUID_RE.test(logId)) return { error: "Invalid log" };
  if (!isValidGradeVote(gradeVote)) return { error: "Invalid grade" };
  const gate = await gateClimberMutation(routeId, "route");
  if ("error" in gate) return gate;
  const { supabase, userId, gymId } = gate;

  try {
    const log = await upsertRouteLog(supabase, userId, routeId, { grade_vote: gradeVote }, logId, gymId);
    // routes.community_grade is updated via trigger (migration 026).
    // Bust the per-route grade cache entry so the route sheet shows
    // fresh average within the next request.
    revalidateTag(tags.routeGrade(routeId), "max");
    return { success: true, log };
  } catch (err) {
    return { error: formatError(err) };
  }
}
