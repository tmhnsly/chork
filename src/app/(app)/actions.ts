"use server";

import { createServerPBFromCookies } from "@/lib/pocketbase-server";
import { upsertRouteLog, createActivityEvent, createComment, updateComment, getCommentsByRoute, getRouteGrade } from "@/lib/data/sets";
import type { RouteLog, Comment, PaginatedComments, ActivityEventType } from "@/lib/data";
import { formatPBError } from "@/lib/pb-error";

export async function updateAttempts(routeId: string, attempts: number, logId?: string) {
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  if (!Number.isInteger(attempts) || attempts < 0) return { error: "Invalid attempts" };

  const pb = await createServerPBFromCookies();
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return { error: "Not authenticated" };
  }

  try {
    const log = await upsertRouteLog(pb.authStore.record.id, routeId, {
      attempts,
    }, logId);
    return { success: true, log };
  } catch (err) {
    return { error: formatPBError(err) };
  }
}

export async function completeRoute(
  routeId: string,
  attempts: number,
  gradeVote: number | null,
  zone: boolean,
  logId?: string
) {
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  if (!Number.isInteger(attempts) || attempts < 1) return { error: "Invalid attempts" };
  if (gradeVote !== null && (!Number.isInteger(gradeVote) || gradeVote < 0 || gradeVote > 10)) {
    return { error: "Invalid grade" };
  }

  const pb = await createServerPBFromCookies();
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return { error: "Not authenticated" };
  }

  const userId = pb.authStore.record.id;
  const isFlash = attempts === 1;

  try {
    const log = await upsertRouteLog(userId, routeId, {
      attempts,
      completed: true,
      completed_at: new Date().toISOString(),
      grade_vote: gradeVote,
      zone,
    }, logId);

    const eventType: ActivityEventType = isFlash ? "flashed" : "completed";
    await createActivityEvent({
      user_id: userId,
      route_id: routeId,
      type: eventType,
    });

    return { success: true, log };
  } catch (err) {
    return { error: formatPBError(err) };
  }
}

export async function uncompleteRoute(routeId: string, logId?: string) {
  const pb = await createServerPBFromCookies();
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return { error: "Not authenticated" };
  }

  try {
    const log = await upsertRouteLog(pb.authStore.record.id, routeId, {
      completed: false,
      completed_at: null,
      grade_vote: null,
    }, logId);
    return { success: true, log };
  } catch (err) {
    return { error: formatPBError(err) };
  }
}

export async function toggleZone(routeId: string, zone: boolean, logId?: string) {
  const pb = await createServerPBFromCookies();
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return { error: "Not authenticated" };
  }

  try {
    const log = await upsertRouteLog(pb.authStore.record.id, routeId, {
      zone,
    }, logId);
    return { success: true, log };
  } catch (err) {
    return { error: formatPBError(err) };
  }
}

export async function postComment(
  routeId: string,
  body: string
): Promise<{ comment?: Comment; error?: string }> {
  if (typeof routeId !== "string" || !routeId) return { error: "Invalid route" };
  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) return { error: "Comment cannot be empty" };

  const pb = await createServerPBFromCookies();
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return { error: "Not authenticated" };
  }

  const userId = pb.authStore.record.id;

  try {
    const comment = await createComment({
      user_id: userId,
      route_id: routeId,
      body: trimmed,
    });

    await createActivityEvent({
      user_id: userId,
      route_id: routeId,
      type: "beta_spray",
    });

    return { comment };
  } catch (err) {
    return { error: formatPBError(err) };
  }
}

export async function fetchComments(
  routeId: string,
  page: number = 1
): Promise<PaginatedComments> {
  try {
    return await getCommentsByRoute(routeId, page, 20);
  } catch {
    return { items: [], totalItems: 0, totalPages: 0, page: 1 };
  }
}

export async function fetchRouteGrade(routeId: string): Promise<number | null> {
  try {
    return await getRouteGrade(routeId);
  } catch {
    return null;
  }
}

export async function editComment(
  commentId: string,
  body: string
): Promise<{ comment?: Comment; error?: string }> {
  if (typeof commentId !== "string" || !commentId) return { error: "Invalid comment" };
  const trimmed = typeof body === "string" ? body.trim() : "";
  if (!trimmed) return { error: "Comment cannot be empty" };

  const pb = await createServerPBFromCookies();
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return { error: "Not authenticated" };
  }

  try {
    const existing = await pb.collection("comments" as string).getOne<Comment>(commentId, {
      fields: "id,user_id",
    });
    if (existing.user_id !== pb.authStore.record.id) {
      return { error: "You can only edit your own comments" };
    }
    const comment = await updateComment(commentId, trimmed);
    return { comment };
  } catch (err) {
    return { error: formatPBError(err) };
  }
}
