import type { TypedPocketBase } from "../pocketbase-types";
import { createAdminPB, clearAdminPB } from "../pocketbase-server";
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

  // Helper: run an admin operation with retry on auth failure
  async function withAdmin<T>(fn: (admin: TypedPocketBase) => Promise<T>): Promise<T> {
    try {
      return await fn(await createAdminPB());
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        clearAdminPB();
        return fn(await createAdminPB());
      }
      throw err;
    }
  }

  if (existing.totalItems > 0) {
    await pb.collection("comment_likes").delete(existing.items[0].id);
    const updated = await withAdmin((admin) =>
      admin.collection("comments").update<Comment>(commentId, { "likes-": 1 })
    );
    const likes = Math.max(0, updated.likes);
    if (likes !== updated.likes) {
      await withAdmin((admin) =>
        admin.collection("comments").update<Comment>(commentId, { likes: 0 })
      );
    }
    return { liked: false, likes };
  }

  await pb.collection("comment_likes").create({ user_id: userId, comment_id: commentId });
  const updated = await withAdmin((admin) =>
    admin.collection("comments").update<Comment>(commentId, { "likes+": 1 })
  );
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
 * Uses admin PB because the activity_events delete API rule is admin-only.
 */
export async function deleteCompletionEvents(
  pb: TypedPocketBase,
  userId: string,
  routeId: string
): Promise<void> {
  // Read with user PB (list/view allowed for auth users)
  const events = await pb.collection("activity_events").getFullList<ActivityEvent>({
    filter: pb.filter(
      "user_id = {:userId} && route_id = {:routeId} && (type = 'completed' || type = 'flashed')",
      { userId, routeId }
    ),
    fields: "id",
  });

  if (events.length === 0) return;

  // Delete with admin PB (delete rule is admin-only)
  const adminPB = await createAdminPB();
  await Promise.all(
    events.map((e) => adminPB.collection("activity_events").delete(e.id))
  );
}
