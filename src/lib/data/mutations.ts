import type { TypedPocketBase } from "../pocketbase-types";
import { createAdminPB } from "../pocketbase-server";
import type { RouteLog, Comment, CommentLike, ActivityEvent, ActivityEventType } from "./types";

/**
 * Create or update a route log. Uses the unique (user_id, route_id) pair
 * to find existing records.
 */
export async function upsertRouteLog(
  pb: TypedPocketBase,
  userId: string,
  routeId: string,
  data: Partial<Pick<RouteLog, "attempts" | "completed" | "completed_at" | "grade_vote" | "zone">>,
  existingLogId?: string
): Promise<RouteLog> {
  if (existingLogId) {
    return pb.collection("route_logs").update<RouteLog>(existingLogId, data);
  }

  const existing = await pb.collection("route_logs").getList<RouteLog>(1, 1, {
    filter: pb.filter("user_id = {:userId} && route_id = {:routeId}", {
      userId,
      routeId,
    }),
    fields: "id",
  });

  if (existing.totalItems > 0) {
    return pb.collection("route_logs").update<RouteLog>(existing.items[0].id, data);
  }

  return pb.collection("route_logs").create<RouteLog>({
    user_id: userId,
    route_id: routeId,
    ...data,
  });
}

/** Create a beta spray comment on a route. */
export async function createComment(
  pb: TypedPocketBase,
  data: { user_id: string; route_id: string; body: string }
): Promise<Comment> {
  return pb.collection("comments").create<Comment>(data, {
    expand: "user_id",
  });
}

/** Update an existing comment's body. */
export async function updateComment(
  pb: TypedPocketBase,
  commentId: string,
  body: string
): Promise<Comment> {
  return pb.collection("comments").update<Comment>(commentId, { body }, {
    expand: "user_id",
  });
}

/**
 * Toggle a like on a comment.
 * - Creates or deletes the `comment_likes` record (user's PB instance)
 * - Atomically increments/decrements `comments.likes` (admin PB instance,
 *   because the comments update API rule restricts to the comment owner)
 *
 * Returns the new like state and authoritative count from the updated record.
 */
export async function toggleCommentLike(
  pb: TypedPocketBase,
  userId: string,
  commentId: string
): Promise<{ liked: boolean; likes: number }> {
  const existing = await pb.collection("comment_likes").getList<CommentLike>(1, 1, {
    filter: pb.filter("user_id = {:userId} && comment_id = {:commentId}", {
      userId,
      commentId,
    }),
    fields: "id",
  });

  const adminPB = await createAdminPB();
  if (existing.totalItems > 0) {
    await pb.collection("comment_likes").delete(existing.items[0].id);
    const updated = await adminPB.collection("comments").update<Comment>(commentId, { "likes-": 1 });
    // Clamp to 0 — legacy comments may have likes=0 from before counter was maintained
    const likes = Math.max(0, updated.likes);
    if (likes !== updated.likes) {
      await adminPB.collection("comments").update<Comment>(commentId, { likes: 0 });
    }
    return { liked: false, likes };
  }

  await pb.collection("comment_likes").create({ user_id: userId, comment_id: commentId });
  const updated = await adminPB.collection("comments").update<Comment>(commentId, { "likes+": 1 });
  return { liked: true, likes: updated.likes };
}

/** Write an activity event. Append-only — never update or delete. */
export async function createActivityEvent(
  pb: TypedPocketBase,
  data: { user_id: string; route_id: string; type: ActivityEventType }
): Promise<ActivityEvent> {
  return pb.collection("activity_events").create<ActivityEvent>(data);
}

/**
 * Delete completion/flash activity events for a user + route.
 * Called on undo to prevent duplicate events if they re-complete.
 */
export async function deleteCompletionEvents(
  pb: TypedPocketBase,
  userId: string,
  routeId: string
): Promise<void> {
  const events = await pb.collection("activity_events").getFullList<ActivityEvent>({
    filter: pb.filter(
      "user_id = {:userId} && route_id = {:routeId} && (type = 'completed' || type = 'flashed')",
      { userId, routeId }
    ),
    fields: "id",
  });

  await Promise.all(
    events.map((e) => pb.collection("activity_events").delete(e.id))
  );
}
