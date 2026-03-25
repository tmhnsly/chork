import { createServerPBFromCookies } from "../pocketbase-server";
import type { UsersResponse } from "../pocketbase-types";
import type { Set, Route, RouteLog, RouteLogWithSetId, Comment, PaginatedComments, ActivityEvent, ActivityEventType } from "./types";

/**
 * Fetch the current active set. Warns if multiple active sets found.
 * Returns null if no active set exists.
 */
export async function getCurrentSet(): Promise<Set | null> {
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("sets" as string).getList<Set>(1, 10, {
    filter: "active = true",
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
  return pb.collection("sets" as string).getFullList<Set>({ sort: "-starts_at" });
}

/** Fetch routes for a set, ordered by number ascending. */
export async function getRoutesBySet(setId: string): Promise<Route[]> {
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("routes" as string).getFullList<Route>({
    filter: pb.filter("set_id = {:setId}", { setId }),
    sort: "number",
  });
  return results;
}

/** Fetch all route logs for a user across all routes in a set. */
export async function getLogsBySetForUser(
  setId: string,
  userId: string
): Promise<RouteLog[]> {
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("route_logs" as string).getFullList<RouteLog>({
    filter: pb.filter("route_id.set_id = {:setId} && user_id = {:userId}", {
      setId,
      userId,
    }),
  });
  return results;
}

/** Fetch all route logs for a user across all sets, with route_id expanded to get set_id. */
export async function getAllLogsForUser(userId: string): Promise<RouteLogWithSetId[]> {
  const pb = await createServerPBFromCookies();
  return pb.collection("route_logs" as string).getFullList<RouteLogWithSetId>({
    filter: pb.filter("user_id = {:userId}", { userId }),
    expand: "route_id",
  });
}

/** Fetch recent activity events for a user, with route and set expanded. */
export async function getActivityEventsForUser(
  userId: string,
  limit: number = 10
): Promise<ActivityEvent[]> {
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("activity_events" as string).getList<ActivityEvent>(1, limit, {
    filter: pb.filter("user_id = {:userId}", { userId }),
    sort: "-created",
    expand: "route_id,route_id.set_id",
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

/** Mean attempts from completed logs for a route. Null if none. */
export async function getRouteStats(
  routeId: string
): Promise<{ avgAttempts: number } | null> {
  const pb = await createServerPBFromCookies();
  const results = await pb.collection("route_logs" as string).getFullList<RouteLog>({
    filter: pb.filter("route_id = {:routeId} && completed = true", { routeId }),
  });

  if (results.length === 0) return null;

  const total = results.reduce((sum, log) => sum + log.attempts, 0);
  return { avgAttempts: Math.round((total / results.length) * 10) / 10 };
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
