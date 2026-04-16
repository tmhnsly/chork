"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { revalidateUserProfile } from "@/lib/cache/revalidate";
import { requireAuth, requireSignedIn } from "@/lib/auth";
import {
  upsertRouteLog,
  createActivityEvent,
  deleteCompletionEvents,
  createComment,
  updateComment,
  toggleCommentLike,
} from "@/lib/data/mutations";
import {
  getCommentsByRoute,
  getRouteGrade,
  getLikedCommentIds,
} from "@/lib/data/queries";
import type {
  RouteLog,
  Comment,
  PaginatedComments,
  ActivityEventType,
} from "@/lib/data";
import { formatError } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";
import { buildBadgeContext } from "@/lib/achievements/context";
import { evaluateAndPersistAchievements } from "@/lib/achievements/evaluate";

type ActionResult<T = unknown> = { error: string } | ({ success: true } & T);
type LogResult = ActionResult<{ log: RouteLog }>;
type CommentResult = { error: string } | { comment: Comment };

export async function updateAttempts(
  routeId: string,
  attempts: number,
  logId?: string
): Promise<LogResult> {
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 999) return { error: "Invalid attempts" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

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
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 999) return { error: "Invalid attempts" };
  // Grade bound matches the DB constraint relaxed in migration 014
  // (0..30 covers V/Font/points scales). The previous 0..10 clamp
  // pre-dated that relaxation; raw votes 11..30 were rejected here
  // even though the DB would happily accept them.
  if (gradeVote !== null && (!Number.isInteger(gradeVote) || gradeVote < 0 || gradeVote > 30)) {
    return { error: "Invalid grade" };
  }

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  const isFlash = attempts === 1;

  try {
    const eventType: ActivityEventType = isFlash ? "flashed" : "completed";
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
    if (log.set_id) {
      revalidateTag(`set:${log.set_id}:leaderboard`);
    }
    revalidateTag(`user:${userId}:stats`);
    // No profile-row bust: a send doesn't change profiles.* fields.
    // user_set_stats does change (via trigger) but that's read by
    // getProfileSummary which isn't server-cached.

    // Post-response: badge eval can be expensive and must never break
    // the logging flow. after() runs this work after the response ships,
    // so the action returns as soon as the log + activity event are
    // written. Badge state catches up within milliseconds.
    after(async () => {
      try {
        const ctx = await buildBadgeContext(supabase, userId, gymId);
        if (ctx) {
          await evaluateAndPersistAchievements(supabase, userId, ctx);
        }
      } catch (err) {
        console.error("[achievements] post-send evaluation failed", err);
      }
    });

    return { success: true, log };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function uncompleteRoute(
  routeId: string,
  logId?: string
): Promise<LogResult> {
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  try {
    const [log] = await Promise.all([
      upsertRouteLog(supabase, userId, routeId, {
        completed: false,
        completed_at: null,
        grade_vote: null,
      }, logId, gymId),
      deleteCompletionEvents(supabase, userId, routeId),
    ]);

    if (log.set_id) {
      revalidateTag(`set:${log.set_id}:leaderboard`);
    }
    revalidateTag(`user:${userId}:stats`);
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
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

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
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  if (typeof logId !== "string" || !logId) return { error: "Invalid log" };
  // Grade bound matches the DB constraint relaxed in migration 014
  // (0..30 covers V/Font/points scales). The previous 0..10 clamp
  // pre-dated that relaxation; raw votes 11..30 were rejected here
  // even though the DB would happily accept them.
  if (gradeVote !== null && (!Number.isInteger(gradeVote) || gradeVote < 0 || gradeVote > 30)) {
    return { error: "Invalid grade" };
  }

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  try {
    const log = await upsertRouteLog(supabase, userId, routeId, { grade_vote: gradeVote }, logId, gymId);
    // routes.community_grade is updated via trigger (migration 026).
    // Bust the per-route grade cache entry so the route sheet shows
    // fresh average within the next request.
    revalidateTag(`route:${routeId}:grade`);
    return { success: true, log };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function postComment(
  routeId: string,
  body: string
): Promise<CommentResult> {
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) return { error: "Comment can't be empty - write something first" };
  if (trimmed.length > 500) return { error: "Comments must be 500 characters or less" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  try {
    const comment = await createComment(supabase, {
      user_id: userId,
      route_id: routeId,
      body: trimmed,
      gym_id: gymId,
    });

    await createActivityEvent(supabase, {
      user_id: userId,
      route_id: routeId,
      type: "beta_spray",
      gym_id: gymId,
    });

    // Narrow: only the crew activity feed renders beta-spray events.
    // The old `revalidatePath("/", "layout")` was scorching the whole
    // app tree on every comment post, which re-rendered the
    // RouteLogSheet's parent → caused the sheet's title bar + close
    // button to flicker and the beta toggle to drop interaction
    // until a full page reload.
    revalidatePath("/crew");
    return { comment };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function fetchComments(
  routeId: string,
  page: number = 1
): Promise<PaginatedComments> {
  if (typeof routeId !== "string" || !routeId) {
    return { items: [], totalItems: 0, totalPages: 0, page: 1 };
  }
  const auth = await requireAuth();
  if ("error" in auth) {
    return { items: [], totalItems: 0, totalPages: 0, page: 1 };
  }
  try {
    return await getCommentsByRoute(auth.supabase, routeId, page, 20);
  } catch (err) {
    console.warn("[chork] fetchComments failed:", err);
    return { items: [], totalItems: 0, totalPages: 0, page: 1 };
  }
}

export async function fetchRouteData(routeId: string): Promise<{
  grade: number | null;
  comments: PaginatedComments;
  likedIds: string[];
}> {
  const empty = {
    grade: null,
    comments: { items: [], totalItems: 0, totalPages: 0, page: 1 } as PaginatedComments,
    likedIds: [],
  };
  if (typeof routeId !== "string" || !routeId) return empty;

  const auth = await requireAuth();
  if ("error" in auth) return empty;
  const { supabase, userId } = auth;

  const [grade, comments, likedSet] = await Promise.all([
    getRouteGrade(routeId).catch((err) => {
      console.warn("[chork] fetchRouteData grade failed:", err);
      return null;
    }),
    getCommentsByRoute(supabase, routeId, 1, 2).catch((err) => {
      console.warn("[chork] fetchRouteData comments failed:", err);
      return { items: [], totalItems: 0, totalPages: 0, page: 1 } as PaginatedComments;
    }),
    getLikedCommentIds(supabase, userId, routeId).catch((err) => {
      console.warn("[chork] fetchRouteData likedIds failed:", err);
      return new Set<string>();
    }),
  ]);

  return { grade, comments, likedIds: [...likedSet] };
}

export async function likeComment(
  commentId: string
): Promise<{ liked?: boolean; likes?: number; error?: string }> {
  if (typeof commentId !== "string" || !commentId) return { error: "Invalid comment" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  try {
    return await toggleCommentLike(supabase, userId, commentId, gymId);
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function editComment(
  commentId: string,
  body: string
): Promise<CommentResult> {
  if (typeof commentId !== "string" || !commentId) return { error: "Invalid comment" };
  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) return { error: "Comment can't be empty - write something first" };
  if (trimmed.length > 500) return { error: "Comments must be 500 characters or less" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  try {
    // Ownership + gym-scope check
    const { data: existing, error: fetchError } = await supabase
      .from("comments")
      .select("user_id, gym_id")
      .eq("id", commentId)
      .single();

    if (fetchError || !existing || existing.user_id !== userId) {
      return { error: "You can only edit your own comments" };
    }
    if (existing.gym_id !== gymId) {
      return { error: "Comment not found" };
    }

    const comment = await updateComment(supabase, commentId, trimmed);
    return { comment };
  } catch (err) {
    return { error: formatError(err) };
  }
}

// Follow / unfollow actions removed — the feature was replaced by the
// crew system (migration 021). Use joinCrew / inviteToCrew instead.

// ────────────────────────────────────────────────────────────────
// Push notification subscriptions
// ────────────────────────────────────────────────────────────────
// Climber opts in from a UI toggle; PushManager.subscribe returns the
// endpoint + keys which we persist here. RLS on push_subscriptions
// (migration 014) allows a user to manage only their own rows, so the
// authed supabase client below is enough — no service role needed.

/**
 * Push-subscription endpoints must be real HTTPS URLs pointing at a
 * browser push service — otherwise `web-push` rejects the dispatch
 * anyway. Validating here keeps malformed strings out of the DB in
 * the first place (defense-in-depth for any future code path that
 * exposes the endpoint).
 */
function isValidPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && endpoint.length >= 10;
  } catch {
    return false;
  }
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<ActionResult> {
  if (typeof input.endpoint !== "string" || !isValidPushEndpoint(input.endpoint)) {
    return { error: "Invalid subscription." };
  }
  if (typeof input.p256dh !== "string" || typeof input.auth !== "string") {
    return { error: "Invalid subscription keys." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        },
        { onConflict: "user_id,endpoint" }
      );
    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function removePushSubscription(
  endpoint: string
): Promise<ActionResult> {
  if (typeof endpoint !== "string" || !isValidPushEndpoint(endpoint)) {
    return { error: "Invalid subscription." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) return { error: formatError(error) };
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ────────────────────────────────────────────────────────────────
// Competitions — climber participation
// ────────────────────────────────────────────────────────────────

/**
 * Climber joins a competition, optionally self-selecting a category.
 * Upsert on the composite key keeps it idempotent and also lets the
 * same call update an already-joined climber's category.
 */
export async function joinCompetition(
  competitionId: string,
  categoryId: string | null = null
): Promise<ActionResult> {
  if (typeof competitionId !== "string" || !UUID_RE.test(competitionId)) {
    return { error: "Invalid competition" };
  }
  if (categoryId !== null && (typeof categoryId !== "string" || !UUID_RE.test(categoryId))) {
    return { error: "Invalid category" };
  }

  // requireAuth (not just signed-in) — joining a competition makes
  // the climber visible on gym-scoped leaderboards, so they must
  // have an active gym context and be a member of a gym that's
  // actually linked to this competition.
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  try {
    // Gate: the caller's active gym must be linked to this
    // competition via `competition_gyms`. Without this check a
    // climber at one gym could join a competition they have no
    // business in by fiddling the URL — RLS alone only enforces
    // user_id=self on the participant row.
    const { data: gymLink } = await supabase
      .from("competition_gyms")
      .select("competition_id")
      .eq("competition_id", competitionId)
      .eq("gym_id", gymId)
      .maybeSingle();
    if (!gymLink) {
      return { error: "This competition isn't running at your gym." };
    }

    // If a category is supplied, confirm it belongs to the competition.
    if (categoryId) {
      const { data: cat } = await supabase
        .from("competition_categories")
        .select("competition_id")
        .eq("id", categoryId)
        .maybeSingle();
      if (!cat || cat.competition_id !== competitionId) {
        return { error: "Category does not belong to this competition" };
      }
    }

    const { error } = await supabase
      .from("competition_participants")
      .upsert(
        { competition_id: competitionId, user_id: userId, category_id: categoryId },
        { onConflict: "competition_id,user_id" }
      );
    if (error) return { error: formatError(error) };

    // Narrow: competition participation only surfaces on the
    // competition detail page + its listing. No need to scorch the
    // root layout (wall, crew, leaderboard are all unaffected).
    revalidatePath(`/competitions/${competitionId}`);
    revalidatePath("/competitions");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function leaveCompetition(
  competitionId: string
): Promise<ActionResult> {
  if (typeof competitionId !== "string" || !UUID_RE.test(competitionId)) {
    return { error: "Invalid competition" };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("competition_participants")
      .delete()
      .eq("competition_id", competitionId)
      .eq("user_id", userId);
    if (error) return { error: formatError(error) };

    revalidatePath(`/competitions/${competitionId}`);
    revalidatePath("/competitions");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ────────────────────────────────────────────────────────────────
// Gym switching — set the climber's active gym context
// ────────────────────────────────────────────────────────────────

/**
 * Switch the signed-in climber's active gym. If they aren't already a
 * member of the target gym, a `climber` membership is created first so
 * subsequent RLS checks against `is_gym_member` succeed. Previous
 * memberships are preserved — switching is purely about which gym
 * surfaces on the wall and Chorkboard.
 */
export async function switchActiveGym(
  gymId: string
): Promise<ActionResult<{ gymId: string }>> {
  if (typeof gymId !== "string" || !UUID_RE.test(gymId)) {
    return { error: "Invalid gym" };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Confirm the target is a real, listed gym (RLS already gates reads
    // — `is_listed=true` are visible to any authed user).
    const { data: gym, error: gymErr } = await supabase
      .from("gyms")
      .select("id")
      .eq("id", gymId)
      .eq("is_listed", true)
      .maybeSingle();
    if (gymErr || !gym) return { error: "Gym not found" };

    // Ensure membership exists — upsert keeps switching idempotent.
    const { error: memErr } = await supabase
      .from("gym_memberships")
      .upsert({ user_id: userId, gym_id: gymId }, { onConflict: "user_id,gym_id" });
    if (memErr) return { error: formatError(memErr) };

    const { error: profErr } = await supabase
      .from("profiles")
      .update({ active_gym_id: gymId })
      .eq("id", userId);
    if (profErr) return { error: formatError(profErr) };

    await revalidateUserProfile(supabase, userId);
    return { success: true, gymId };
  } catch (err) {
    return { error: formatError(err) };
  }
}
