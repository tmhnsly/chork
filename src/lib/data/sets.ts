import { createServerPBFromCookies } from "../pocketbase-server";
import type { UsersResponse } from "../pocketbase-types";
import type {
  Set,
  Route,
  RouteLog,
  RouteLogWithSetId,
  Comment,
  PaginatedComments,
  ActivityEvent,
  ActivityEventType,
  RouteGradeView,
  UserSetStatsView,
} from "./types";

/**
 * Fetch the current active set. Warns if multiple active sets found.
 * Returns null if no active set exists.
 */
export async function getCurrentSet(): Promise<Set | null> {
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("sets" as string).getList<Set>(1, 2, {
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
export async function getUserByUsername(username: string): Promise<UsersResponse | null> {
  const pb = await createServerPBFromCookies();
  try {
    return await pb.collection("users").getFirstListItem(
      pb.filter("username = {:username}", { username })
    );
  } catch {
    return null;
  }
}

/** Fetch all sets ordered by starts_at descending. */
export async function getAllSets(): Promise<Set[]> {
  const pb = await createServerPBFromCookies();
  return pb.collection("sets" as string).getFullList<Set>({
    sort: "-starts_at",
    fields: "id,starts_at,ends_at,active,created,updated",
  });
}

/** Fetch routes for a set, ordered by number ascending. */
export async function getRoutesBySet(setId: string): Promise<Route[]> {
  const pb = await createServerPBFromCookies();
  return pb.collection("routes" as string).getFullList<Route>({
    filter: pb.filter("set_id = {:setId}", { setId }),
    sort: "number",
    fields: "id,set_id,number,has_zone,created,updated",
  });
}

/** Fetch all route logs for a user across all routes in a set. */
export async function getLogsBySetForUser(
  setId: string,
  userId: string
): Promise<RouteLog[]> {
  const pb = await createServerPBFromCookies();
  return pb.collection("route_logs" as string).getFullList<RouteLog>({
    filter: pb.filter("route_id.set_id = {:setId} && user_id = {:userId}", {
      setId,
      userId,
    }),
    fields: "id,user_id,route_id,attempts,completed,completed_at,grade_vote,zone,created,updated",
  });
}

/** Fetch all route logs for a user across all sets, with route_id expanded to get set_id. */
export async function getAllLogsForUser(userId: string): Promise<RouteLogWithSetId[]> {
  const pb = await createServerPBFromCookies();
  return pb.collection("route_logs" as string).getFullList<RouteLogWithSetId>({
    filter: pb.filter("user_id = {:userId}", { userId }),
    expand: "route_id",
    fields: "id,user_id,route_id,attempts,completed,completed_at,grade_vote,zone,created,updated,expand.route_id.set_id",
  });
}

/**
 * Fetch pre-aggregated per-set stats for a user from the `user_set_stats` view.
 * Returns one row per set the user has interacted with.
 * Falls back to getAllLogsForUser if the view doesn't exist yet.
 */
export async function getUserSetStats(userId: string): Promise<UserSetStatsView[]> {
  const pb = await createServerPBFromCookies();
  try {
    return await pb.collection("user_set_stats" as string).getFullList<UserSetStatsView>({
      filter: pb.filter("user_id = {:userId}", { userId }),
      fields: "id,user_id,set_id,completions,flashes,points",
    });
  } catch {
    // View doesn't exist yet — fall back silently
    return [];
  }
}

/** Fetch recent activity events for a user, with route expanded (1 level only). */
export async function getActivityEventsForUser(
  userId: string,
  limit: number = 10
): Promise<ActivityEvent[]> {
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("activity_events" as string).getList<ActivityEvent>(1, limit, {
    filter: pb.filter("user_id = {:userId}", { userId }),
    sort: "-created",
    expand: "route_id",
    fields: "id,user_id,type,route_id,created,updated,expand.route_id.number",
  });
  return results.items;
}

/**
 * Create or update a route log. Uses the unique (user_id, route_id) pair
 * to find existing records.
 */
export async function upsertRouteLog(
  userId: string,
  routeId: string,
  data: Partial<Pick<RouteLog, "attempts" | "completed" | "completed_at" | "grade_vote" | "zone">>,
  existingLogId?: string
): Promise<RouteLog> {
  const pb = await createServerPBFromCookies();

  // If caller knows the log ID, skip the lookup entirely
  if (existingLogId) {
    return pb
      .collection("route_logs" as string)
      .update<RouteLog>(existingLogId, data);
  }

  const existing = await pb.collection("route_logs" as string).getList<RouteLog>(1, 1, {
    filter: pb.filter("user_id = {:userId} && route_id = {:routeId}", {
      userId,
      routeId,
    }),
    fields: "id",
  });

  if (existing.totalItems > 0) {
    return pb
      .collection("route_logs" as string)
      .update<RouteLog>(existing.items[0].id, data);
  }

  return pb.collection("route_logs" as string).create<RouteLog>({
    user_id: userId,
    route_id: routeId,
    ...data,
  });
}

/**
 * Community grade for a route via the `route_grades` PocketBase View.
 * Falls back to computing from individual logs if the view doesn't exist.
 */
export async function getRouteGrade(routeId: string): Promise<number | null> {
  const pb = await createServerPBFromCookies();

  // Try the view first (single record lookup — O(1))
  try {
    const results = await pb.collection("route_grades" as string).getList<RouteGradeView>(1, 1, {
      filter: pb.filter("route_id = {:routeId}", { routeId }),
      fields: "community_grade",
    });
    if (results.totalItems > 0) {
      return results.items[0].community_grade;
    }
    return null;
  } catch {
    // View doesn't exist yet — fall back to computing from logs
    const results = await pb.collection("route_logs" as string).getFullList<RouteLog>({
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

/** Paginated comments for a route, ordered by created descending (newest first). */
export async function getCommentsByRoute(
  routeId: string,
  page: number = 1,
  perPage: number = 20
): Promise<PaginatedComments> {
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("comments" as string).getList<Comment>(page, perPage, {
    filter: pb.filter("route_id = {:routeId}", { routeId }),
    sort: "-created",
    expand: "user_id",
    fields: "id,user_id,route_id,body,created,updated,expand.user_id.id,expand.user_id.collectionId,expand.user_id.username,expand.user_id.name,expand.user_id.avatar",
  });
  return {
    items: results.items,
    totalItems: results.totalItems,
    totalPages: results.totalPages,
    page: results.page,
  };
}

/** Create a beta spray comment on a route. */
export async function createComment(data: {
  user_id: string;
  route_id: string;
  body: string;
}): Promise<Comment> {
  const pb = await createServerPBFromCookies();
  return pb.collection("comments" as string).create<Comment>(data, {
    expand: "user_id",
  });
}

/** Update an existing comment's body. */
export async function updateComment(
  commentId: string,
  body: string
): Promise<Comment> {
  const pb = await createServerPBFromCookies();
  return pb.collection("comments" as string).update<Comment>(commentId, { body }, {
    expand: "user_id",
  });
}

/** Write an activity event. Append-only — never update or delete. */
export async function createActivityEvent(data: {
  user_id: string;
  route_id: string;
  type: ActivityEventType;
}): Promise<ActivityEvent> {
  const pb = await createServerPBFromCookies();
  return pb.collection("activity_events" as string).create<ActivityEvent>(data);
}
