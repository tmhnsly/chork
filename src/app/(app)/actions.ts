"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
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

type ActionResult<T = unknown> = { error: string } | ({ success: true } & T);
type LogResult = ActionResult<{ log: RouteLog }>;
type CommentResult = { error: string } | { comment: Comment };

export async function updateAttempts(
  routeId: string,
  attempts: number,
  logId?: string
): Promise<LogResult> {
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  if (!Number.isInteger(attempts) || attempts < 0) return { error: "Invalid attempts" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const log = await upsertRouteLog(supabase, userId, routeId, { attempts }, logId);
    revalidatePath("/", "layout");
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
  if (!Number.isInteger(attempts) || attempts < 1) return { error: "Invalid attempts" };
  if (gradeVote !== null && (!Number.isInteger(gradeVote) || gradeVote < 0 || gradeVote > 10)) {
    return { error: "Invalid grade" };
  }

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

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
      }, logId),
      createActivityEvent(supabase, {
        user_id: userId,
        route_id: routeId,
        type: eventType,
      }),
    ]);

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
  const { supabase, userId } = auth;

  try {
    const [log] = await Promise.all([
      upsertRouteLog(supabase, userId, routeId, {
        completed: false,
        completed_at: null,
        grade_vote: null,
      }, logId),
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
  const { supabase, userId } = auth;

  try {
    const log = await upsertRouteLog(supabase, userId, routeId, { zone }, logId);
    revalidatePath("/", "layout");
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
  if (!trimmed) return { error: "Comment can't be empty — write something first" };
  if (trimmed.length > 500) return { error: "Comments must be 500 characters or less" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const comment = await createComment(supabase, {
      user_id: userId,
      route_id: routeId,
      body: trimmed,
    });

    await createActivityEvent(supabase, {
      user_id: userId,
      route_id: routeId,
      type: "beta_spray",
    });

    return { comment };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function fetchComments(
  routeId: string,
  page: number = 1
): Promise<PaginatedComments> {
  const supabase = await createServerSupabase();
  try {
    return await getCommentsByRoute(supabase, routeId, page, 20);
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
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const [grade, comments, likedSet] = await Promise.all([
    getRouteGrade(supabase, routeId).catch((err) => {
      console.warn("[chork] fetchRouteData grade failed:", err);
      return null;
    }),
    getCommentsByRoute(supabase, routeId, 1, 2).catch((err) => {
      console.warn("[chork] fetchRouteData comments failed:", err);
      return { items: [], totalItems: 0, totalPages: 0, page: 1 } as PaginatedComments;
    }),
    userId
      ? getLikedCommentIds(supabase, userId, routeId).catch((err) => {
          console.warn("[chork] fetchRouteData likedIds failed:", err);
          return new Set<string>();
        })
      : Promise.resolve(new Set<string>()),
  ]);

  return { grade, comments, likedIds: [...likedSet] };
}

export async function likeComment(
  commentId: string
): Promise<{ liked?: boolean; likes?: number; error?: string }> {
  if (typeof commentId !== "string" || !commentId) return { error: "Invalid comment" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    return await toggleCommentLike(supabase, userId, commentId);
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
  if (!trimmed) return { error: "Comment can't be empty — write something first" };
  if (trimmed.length > 500) return { error: "Comments must be 500 characters or less" };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Ownership check
    const { data: existing } = await supabase
      .from("comments")
      .select("user_id")
      .eq("id", commentId)
      .single();

    if (!existing || existing.user_id !== userId) {
      return { error: "You can only edit your own comments" };
    }

    const comment = await updateComment(supabase, commentId, trimmed);
    return { comment };
  } catch (err) {
    return { error: formatError(err) };
  }
}
