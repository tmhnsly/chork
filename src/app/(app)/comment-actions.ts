"use server";

import { revalidateTag } from "next/cache";
import { gateClimberMutation, requireAuth } from "@/lib/auth";
import {
  createComment,
  updateComment,
  toggleCommentLike,
  createActivityEvent,
} from "@/lib/data/mutations";
import { getCommentsByRoute, getLikedCommentIds } from "@/lib/data/comment-queries";
import { getRouteGrade } from "@/lib/data/route-queries";
import type { Comment, PaginatedComments } from "@/lib/data";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { tags } from "@/lib/cache/tags";
import type { ActionResult } from "@/lib/action-result";

type CommentResult = { error: string } | { comment: Comment };

export async function postComment(
  routeId: string,
  body: string
): Promise<CommentResult> {
  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) return { error: "Comment can't be empty - write something first" };
  if (trimmed.length > 500) return { error: "Comments must be 500 characters or less" };
  const gate = await gateClimberMutation(routeId, "route");
  if ("error" in gate) return gate;
  const { supabase, userId, gymId } = gate;

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

    // Bust the per-route comment cache so the next fetcher sees the
    // new comment without waiting out the 60s staleTime. Safe no-op
    // today (comments aren't wrapped in cachedQuery yet), but the
    // tag-shape is registered in `tags.ts` so a future cache wrap
    // doesn't silently serve stale post-mutation.
    //
    // No `revalidatePath("/crew")` here — CLAUDE.md forbids path
    // revalidation. The crew activity feed picks up the new
    // beta-spray event on its next render (60s `staleTimes.dynamic`
    // window). When tighter freshness is needed, introduce a
    // dedicated `userCrewActivity` tag rather than re-adding a path
    // call.
    revalidateTag(tags.routeComments(routeId), "max");
    return { comment };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function fetchComments(
  routeId: string,
  page: number = 1
): Promise<PaginatedComments> {
  if (!UUID_RE.test(routeId)) {
    return { items: [], totalItems: 0, totalPages: 0, page: 1 };
  }
  // `fetchComments` is a public server action — any client can call
  // it with arbitrary args. Clamp `page` to a positive integer so a
  // hostile or malformed payload (page=0, page=-1, page=NaN, page=1.5)
  // can't reach the Postgres OFFSET clause with a value that would
  // either error or scan past intended bounds.
  const safePage =
    Number.isInteger(page) && page >= 1 ? page : 1;
  const auth = await requireAuth();
  if ("error" in auth) {
    return { items: [], totalItems: 0, totalPages: 0, page: 1 };
  }
  try {
    return await getCommentsByRoute(routeId, safePage, 20);
  } catch (err) {
    logger.warn("fetchcomments_failed", { err: formatErrorForLog(err) });
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
  if (!UUID_RE.test(routeId)) return empty;

  const auth = await requireAuth();
  if ("error" in auth) return empty;
  const { supabase, userId } = auth;

  const [grade, comments, likedSet] = await Promise.all([
    getRouteGrade(routeId).catch((err) => {
      logger.warn("fetchroutedata_grade_failed", { err: formatErrorForLog(err) });
      return null;
    }),
    getCommentsByRoute(routeId, 1, 2).catch((err) => {
      logger.warn("fetchroutedata_comments_failed", { err: formatErrorForLog(err) });
      return { items: [], totalItems: 0, totalPages: 0, page: 1 } as PaginatedComments;
    }),
    getLikedCommentIds(supabase, userId, routeId).catch((err) => {
      logger.warn("fetchroutedata_likedids_failed", { err: formatErrorForLog(err) });
      return new Set<string>();
    }),
  ]);

  return { grade, comments, likedIds: [...likedSet] };
}

export async function likeComment(
  commentId: string
): Promise<ActionResult<{ liked: boolean; likes: number }>> {
  const gate = await gateClimberMutation(commentId, "comment");
  if ("error" in gate) return gate;
  const { supabase, userId, gymId } = gate;

  try {
    const result = await toggleCommentLike(supabase, userId, commentId, gymId);
    return { success: true, ...result };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function editComment(
  commentId: string,
  body: string
): Promise<CommentResult> {
  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) return { error: "Comment can't be empty - write something first" };
  if (trimmed.length > 500) return { error: "Comments must be 500 characters or less" };
  const gate = await gateClimberMutation(commentId, "comment");
  if ("error" in gate) return gate;
  const { supabase, userId, gymId } = gate;

  try {
    // Ownership + gym-scope check
    const { data: existing, error: fetchError } = await supabase
      .from("comments")
      .select("user_id, gym_id, route_id")
      .eq("id", commentId)
      .single();

    if (fetchError || !existing || existing.user_id !== userId) {
      return { error: "You can only edit your own comments" };
    }
    if (existing.gym_id !== gymId) {
      return { error: "Comment not found" };
    }

    const comment = await updateComment(supabase, commentId, trimmed);
    // Mirror postComment — bust the per-route comment cache tag so
    // a future cache wrap doesn't serve stale edited text.
    revalidateTag(tags.routeComments(existing.route_id), "max");
    return { comment };
  } catch (err) {
    return { error: formatError(err) };
  }
}
