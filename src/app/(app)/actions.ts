"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requireSignedIn } from "@/lib/auth";
import {
  upsertRouteLog,
  createActivityEvent,
  deleteCompletionEvents,
  createComment,
  updateComment,
  toggleCommentLike,
  toggleFollow,
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
  if (gradeVote !== null && (!Number.isInteger(gradeVote) || gradeVote < 0 || gradeVote > 10)) {
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

    // Evaluate badges in the background — must never break the logging flow.
    try {
      const ctx = await buildBadgeContext(supabase, userId, gymId);
      if (ctx) {
        await evaluateAndPersistAchievements(supabase, userId, ctx);
      }
    } catch (err) {
      console.error("[achievements] post-send evaluation failed", err);
    }

    revalidatePath("/", "layout");
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
    revalidatePath("/", "layout");
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
  if (gradeVote !== null && (!Number.isInteger(gradeVote) || gradeVote < 0 || gradeVote > 10)) {
    return { error: "Invalid grade" };
  }

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  try {
    const log = await upsertRouteLog(supabase, userId, routeId, { grade_vote: gradeVote }, logId, gymId);
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

    revalidatePath("/", "layout");
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
    getRouteGrade(supabase, routeId).catch((err) => {
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

// ── Follows ───────────────────────────────────────

export async function followUser(
  targetUserId: string
): Promise<ActionResult<{ following: boolean; followerCount: number }>> {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof targetUserId !== "string" || !UUID_RE.test(targetUserId)) {
    return { error: "Invalid user" };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  if (userId === targetUserId) {
    return { error: "You can't follow yourself" };
  }

  try {
    const result = await toggleFollow(supabase, userId, targetUserId);
    revalidatePath("/", "layout");
    return {
      success: true,
      following: result.following,
      followerCount: result.followerCount,
    };
  } catch (err) {
    return { error: formatError(err) };
  }
}
