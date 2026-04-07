import type { TypedPocketBase, UsersResponse } from "../pocketbase-types";
import type {
  RouteSet,
  Route,
  RouteLog,
  RouteLogWithSetId,
  Comment,
  CommentLike,
  PaginatedComments,
  ActivityEvent,
  RouteGradeView,
  UserSetStatsView,
} from "./types";

/**
 * Fetch the current active set. Warns if multiple active sets found.
 * Returns null if no active set exists.
 */
export async function getCurrentSet(pb: TypedPocketBase): Promise<RouteSet | null> {
  const results = await pb.collection("sets").getList<RouteSet>(1, 2, {
    filter: "active = true",
    fields: "id,starts_at,ends_at,active,created,updated",
  });

  if (results.totalItems === 0) return null;

  if (results.totalItems > 1) {
    console.warn(
      `[chork] ${results.totalItems} active sets found — expected exactly 1. Using first.`
    );
  }

  return results.items[0];
}

/** Fetch a user by username. Returns null if not found. */
export async function getUserByUsername(pb: TypedPocketBase, username: string): Promise<UsersResponse | null> {
  try {
    return await pb.collection("users").getFirstListItem(
      pb.filter("username = {:username}", { username })
    );
  } catch (err) {
    console.warn("[chork] getUserByUsername failed:", err);
    return null;
  }
}

/** Fetch all sets ordered by starts_at descending. */
export async function getAllSets(pb: TypedPocketBase): Promise<RouteSet[]> {
  return pb.collection("sets").getFullList<RouteSet>({
    sort: "-starts_at",
    fields: "id,starts_at,ends_at,active,created,updated",
  });
}

/** Fetch routes for a set, ordered by number ascending. */
export async function getRoutesBySet(pb: TypedPocketBase, setId: string): Promise<Route[]> {
  return pb.collection("routes").getFullList<Route>({
    filter: pb.filter("set_id = {:setId}", { setId }),
    sort: "number",
    fields: "id,set_id,number,has_zone,created,updated",
  });
}

/** Fetch all route logs for a user across all routes in a set. */
export async function getLogsBySetForUser(
  pb: TypedPocketBase,
  setId: string,
  userId: string
): Promise<RouteLog[]> {
  return pb.collection("route_logs").getFullList<RouteLog>({
    filter: pb.filter("route_id.set_id = {:setId} && user_id = {:userId}", {
      setId,
      userId,
    }),
    fields: "id,user_id,route_id,attempts,completed,completed_at,grade_vote,zone,created,updated",
  });
}

/** Fetch all route logs for a user across all sets, with route_id expanded to get set_id. */
export async function getAllLogsForUser(pb: TypedPocketBase, userId: string): Promise<RouteLogWithSetId[]> {
  return pb.collection("route_logs").getFullList<RouteLogWithSetId>({
    filter: pb.filter("user_id = {:userId}", { userId }),
    expand: "route_id",
    fields: "id,user_id,route_id,attempts,completed,completed_at,grade_vote,zone,created,updated,expand.route_id.set_id",
  });
}

/**
 * Fetch pre-aggregated per-set stats for a user from the `user_set_stats` view.
 * Returns one row per set the user has interacted with.
 * Falls back to empty array if the view doesn't exist yet.
 */
export async function getUserSetStats(pb: TypedPocketBase, userId: string): Promise<UserSetStatsView[]> {
  try {
    return await pb.collection("user_set_stats").getFullList<UserSetStatsView>({
      filter: pb.filter("user_id = {:userId}", { userId }),
      fields: "id,user_id,set_id,completions,flashes,points",
    });
  } catch (err) {
    console.warn("[chork] getUserSetStats failed:", err);
    return [];
  }
}

/** Fetch recent activity events for a user, with route expanded (1 level only). */
export async function getActivityEventsForUser(
  pb: TypedPocketBase,
  userId: string,
  limit: number = 10
): Promise<ActivityEvent[]> {
  const results = await pb.collection("activity_events").getList<ActivityEvent>(1, limit, {
    filter: pb.filter("user_id = {:userId}", { userId }),
    sort: "-created",
    expand: "route_id",
    fields: "id,user_id,type,route_id,created,updated,expand.route_id.number",
  });
  return results.items;
}

/**
 * Community grade for a route via the `route_grades` PocketBase View.
 * Falls back to computing from individual logs if the view doesn't exist.
 */
export async function getRouteGrade(pb: TypedPocketBase, routeId: string): Promise<number | null> {
  try {
    const results = await pb.collection("route_grades").getList<RouteGradeView>(1, 1, {
      filter: pb.filter("route_id = {:routeId}", { routeId }),
      fields: "community_grade",
    });
    if (results.totalItems > 0) {
      return results.items[0].community_grade;
    }
    return null;
  } catch (err) {
    console.warn("[chork] getRouteGrade view failed, computing from logs:", err);
    const results = await pb.collection("route_logs").getFullList<RouteLog>({
      filter: pb.filter("route_id = {:routeId} && completed = true && grade_vote != null", { routeId }),
      fields: "grade_vote",
    });
    const votes = results
      .map((r) => r.grade_vote)
      .filter((v): v is number => v !== null);
    if (votes.length === 0) return null;
    const sum = votes.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / votes.length);
  }
}

/** Paginated comments for a route, ordered by most liked then newest. */
export async function getCommentsByRoute(
  pb: TypedPocketBase,
  routeId: string,
  page: number = 1,
  perPage: number = 20
): Promise<PaginatedComments> {
  const results = await pb.collection("comments").getList<Comment>(page, perPage, {
    filter: pb.filter("route_id = {:routeId}", { routeId }),
    sort: "-likes,-created",
    expand: "user_id",
    fields: "id,user_id,route_id,body,likes,created,updated,expand.user_id.id,expand.user_id.collectionId,expand.user_id.username,expand.user_id.name,expand.user_id.avatar",
  });
  return {
    items: results.items,
    totalItems: results.totalItems,
    totalPages: results.totalPages,
    page: results.page,
  };
}

/**
 * Fetch the comment IDs liked by a specific user for a given route.
 * O(user's likes for this route) — typically 0–15 records.
 */
export async function getLikedCommentIds(
  pb: TypedPocketBase,
  userId: string,
  routeId: string
): Promise<Set<string>> {
  const results = await pb.collection("comment_likes").getFullList<CommentLike>({
    filter: pb.filter(
      "user_id = {:userId} && comment_id.route_id = {:routeId}",
      { userId, routeId }
    ),
    fields: "comment_id",
  });
  return new Set(results.map((r) => r.comment_id));
}
