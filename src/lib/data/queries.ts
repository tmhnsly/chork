import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type {
  Profile,
  Gym,
  RouteSet,
  Route,
  RouteLog,
  RouteLogWithSetId,
  Comment,
  PaginatedComments,
  ActivityEventWithRoute,
  GymRole,
  LeaderboardEntry,
} from "./types";

type Supabase = SupabaseClient<Database>;

// ── Gym membership ─────────────────────────────────

export async function getUserGymRole(
  supabase: Supabase,
  userId: string,
  gymId: string
): Promise<GymRole | null> {
  const { data, error } = await supabase
    .from("gym_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("gym_id", gymId)
    .maybeSingle();
  if (error) {
    console.warn("[chork] getUserGymRole failed:", error);
    return null;
  }
  return (data?.role as GymRole) ?? null;
}

// Re-export from pure module so existing imports don't break
export { isGymAdmin } from "./roles";

// ── Profiles ───────────────────────────────────────

export async function getProfile(supabase: Supabase, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    console.warn("[chork] getProfile failed:", error);
    return null;
  }
  return data;
}

export async function getProfileByUsername(supabase: Supabase, username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();
  if (error) {
    console.warn("[chork] getProfileByUsername failed:", error);
    return null;
  }
  return data;
}

// ── Gyms ───────────────────────────────────────────

export async function searchGyms(supabase: Supabase, query: string): Promise<Gym[]> {
  const { data, error } = await supabase
    .from("gyms")
    .select("*")
    .eq("is_listed", true)
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(20);
  if (error) {
    console.warn("[chork] searchGyms failed:", error);
    return [];
  }
  return data ?? [];
}

export async function getGym(supabase: Supabase, gymId: string): Promise<Gym | null> {
  const { data, error } = await supabase
    .from("gyms")
    .select("*")
    .eq("id", gymId)
    .single();
  if (error) {
    console.warn("[chork] getGym failed:", error);
    return null;
  }
  return data;
}

// ── Sets ───────────────────────────────────────────

export async function getCurrentSet(supabase: Supabase, gymId: string): Promise<RouteSet | null> {
  const { data, error } = await supabase
    .from("sets")
    .select("*")
    .eq("gym_id", gymId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[chork] getCurrentSet failed:", error);
    return null;
  }
  return data;
}

export async function getAllSets(supabase: Supabase, gymId: string): Promise<RouteSet[]> {
  const { data, error } = await supabase
    .from("sets")
    .select("*")
    .eq("gym_id", gymId)
    .order("starts_at", { ascending: false });
  if (error) {
    console.warn("[chork] getAllSets failed:", error);
    return [];
  }
  return data ?? [];
}

// ── Routes ─────────────────────────────────────────

export async function getRoutesBySet(supabase: Supabase, setId: string): Promise<Route[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("*")
    .eq("set_id", setId)
    .order("number");
  if (error) {
    console.warn("[chork] getRoutesBySet failed:", error);
    return [];
  }
  return data ?? [];
}

// ── Route logs ─────────────────────────────────────

export async function getLogsBySetForUser(
  supabase: Supabase,
  setId: string,
  userId: string
): Promise<RouteLog[]> {
  const { data, error } = await supabase
    .from("route_logs")
    .select("*, routes!inner(set_id)")
    .eq("routes.set_id", setId)
    .eq("user_id", userId);
  if (error) {
    console.warn("[chork] getLogsBySetForUser failed:", error);
    return [];
  }
  return (data ?? []) as RouteLog[];
}

export async function getAllLogsForUser(
  supabase: Supabase,
  userId: string
): Promise<RouteLogWithSetId[]> {
  // Only select columns needed for all-time stats derivation.
  // computePoints/isFlash use attempts + completed + zone; set grouping uses routes(id).
  const { data, error } = await supabase
    .from("route_logs")
    .select("route_id, attempts, completed, zone, routes(id)")
    .eq("user_id", userId);
  if (error) {
    console.warn("[chork] getAllLogsForUser failed:", error);
    return [];
  }
  return (data ?? []) as unknown as RouteLogWithSetId[];
}

export interface UserLogInGym {
  route_id: string;
  set_id: string;
  attempts: number;
  completed: boolean;
  zone: boolean;
  grade_vote: number | null;
}

/**
 * Single-call fetch of everything the profile page needs for all-time stats
 * and per-set mini grids — user's logs scoped to the gym, plus the total
 * number of routes in that gym for the coverage denominator.
 */
export async function getAllRouteDataForUserInGym(
  supabase: Supabase,
  gymId: string,
  userId: string,
  setIds: string[]
): Promise<{ logs: UserLogInGym[]; totalRoutesInGym: number }> {
  if (setIds.length === 0) return { logs: [], totalRoutesInGym: 0 };

  const [logsResult, routesResult] = await Promise.all([
    supabase
      .from("route_logs")
      .select("route_id, attempts, completed, zone, grade_vote, routes!inner(set_id)")
      .eq("user_id", userId)
      .eq("gym_id", gymId),
    supabase
      .from("routes")
      .select("id", { count: "exact", head: true })
      .in("set_id", setIds),
  ]);

  if (logsResult.error) {
    console.warn("[chork] getAllRouteDataForUserInGym logs failed:", logsResult.error);
  }
  if (routesResult.error) {
    console.warn("[chork] getAllRouteDataForUserInGym count failed:", routesResult.error);
  }

  type LogRow = {
    route_id: string;
    attempts: number;
    completed: boolean;
    zone: boolean;
    grade_vote: number | null;
    routes: { set_id: string } | { set_id: string }[] | null;
  };

  const logs: UserLogInGym[] = (logsResult.data ?? []).map((r: LogRow) => {
    const route = Array.isArray(r.routes) ? r.routes[0] : r.routes;
    return {
      route_id: r.route_id,
      set_id: route?.set_id ?? "",
      attempts: r.attempts,
      completed: r.completed,
      zone: r.zone,
      grade_vote: r.grade_vote,
    };
  }).filter((l) => l.set_id !== "");

  return {
    logs,
    totalRoutesInGym: routesResult.count ?? 0,
  };
}

// ── Stats (RPC functions) ──────────────────────────

export async function getUserSetStats(
  supabase: Supabase,
  userId: string,
  gymId: string
): Promise<{ set_id: string; completions: number; flashes: number; points: number }[]> {
  const { data, error } = await supabase.rpc("get_user_set_stats", {
    p_user_id: userId,
    p_gym_id: gymId,
  });
  if (error) {
    console.warn("[chork] getUserSetStats failed:", error);
    return [];
  }
  return data ?? [];
}

export async function getRouteGrade(
  supabase: Supabase,
  routeId: string
): Promise<number | null> {
  const { data, error } = await supabase.rpc("get_route_grade", {
    p_route_id: routeId,
  });
  if (error) {
    console.warn("[chork] getRouteGrade failed:", error);
    return null;
  }
  if (data && data.length > 0) {
    return data[0].community_grade;
  }
  return null;
}

// ── Activity events ────────────────────────────────

export async function getActivityEventsForUser(
  supabase: Supabase,
  userId: string,
  limit: number = 10
): Promise<ActivityEventWithRoute[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("*, routes(number)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[chork] getActivityEventsForUser failed:", error);
    return [];
  }
  return (data ?? []) as ActivityEventWithRoute[];
}

// ── Comments ───────────────────────────────────────

export async function getCommentsByRoute(
  supabase: Supabase,
  routeId: string,
  page: number = 1,
  perPage: number = 20
): Promise<PaginatedComments> {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // Single query: fetch data + exact count in one round trip
  const { data, count, error } = await supabase
    .from("comments")
    .select("*, profiles(id, username, name, avatar_url)", { count: "exact" })
    .eq("route_id", routeId)
    .order("likes", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.warn("[chork] getCommentsByRoute failed:", error);
  }

  const totalItems = count ?? 0;

  return {
    items: (data ?? []) as Comment[],
    totalItems,
    totalPages: Math.ceil(totalItems / perPage),
    page,
  };
}

// ── Comment likes ──────────────────────────────────

export async function getLikedCommentIds(
  supabase: Supabase,
  userId: string,
  routeId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("comment_likes")
    .select("comment_id, comments!inner(route_id)")
    .eq("user_id", userId)
    .eq("comments.route_id", routeId);

  if (error) {
    console.warn("[chork] getLikedCommentIds failed:", error);
    return new Set();
  }

  return new Set((data ?? []).map((r) => r.comment_id));
}

// ── Follows ───────────────────────────────────────

export async function isFollowing(
  supabase: Supabase,
  followerId: string,
  followingId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  if (error) {
    console.warn("[chork] isFollowing failed:", error);
    return false;
  }
  return data !== null;
}

export type FollowListUser = Pick<Profile, "id" | "username" | "name" | "avatar_url">;

/** Users who follow the given userId. Ordered newest-first. */
export async function getFollowers(
  supabase: Supabase,
  userId: string
): Promise<FollowListUser[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("created_at, follower:profiles!follows_follower_id_fkey(id, username, name, avatar_url)")
    .eq("following_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[chork] getFollowers failed:", error);
    return [];
  }
  return (data ?? [])
    .map((r) => r.follower as unknown as FollowListUser | null)
    .filter((p): p is FollowListUser => p !== null);
}

/** Users the given userId follows. Ordered newest-first. */
export async function getFollowing(
  supabase: Supabase,
  userId: string
): Promise<FollowListUser[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("created_at, following:profiles!follows_following_id_fkey(id, username, name, avatar_url)")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[chork] getFollowing failed:", error);
    return [];
  }
  return (data ?? [])
    .map((r) => r.following as unknown as FollowListUser | null)
    .filter((p): p is FollowListUser => p !== null);
}

// ── Leaderboard ───────────────────────────────────

/** Fetch a page of the leaderboard. setId=null returns the all-time leaderboard. */
export async function getLeaderboard(
  supabase: Supabase,
  gymId: string,
  setId: string | null,
  limit: number = 10,
  offset: number = 0
): Promise<LeaderboardEntry[]> {
  const { data, error } = setId
    ? await supabase.rpc("get_leaderboard_set", {
        p_gym_id: gymId,
        p_set_id: setId,
        p_limit: limit,
        p_offset: offset,
      })
    : await supabase.rpc("get_leaderboard_all_time", {
        p_gym_id: gymId,
        p_limit: limit,
        p_offset: offset,
      });

  if (error) {
    console.warn("[chork] getLeaderboard failed:", error);
    return [];
  }
  return normaliseLeaderboardRows(data ?? []);
}

/** Fetch 5 rows centred on the user's rank. Empty array if user has no climbs. */
export async function getLeaderboardNeighbourhood(
  supabase: Supabase,
  gymId: string,
  userId: string,
  setId: string | null
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_leaderboard_neighbourhood", {
    p_gym_id: gymId,
    p_user_id: userId,
    p_set_id: setId ?? undefined,
  });
  if (error) {
    console.warn("[chork] getLeaderboardNeighbourhood failed:", error);
    return [];
  }
  return normaliseLeaderboardRows(data ?? []);
}

/** Fetch the user's own row. Returns a zero-stats row with rank=null if unranked. */
export async function getLeaderboardUserRow(
  supabase: Supabase,
  gymId: string,
  userId: string,
  setId: string | null
): Promise<LeaderboardEntry | null> {
  const { data, error } = await supabase.rpc("get_leaderboard_user_row", {
    p_gym_id: gymId,
    p_user_id: userId,
    p_set_id: setId ?? undefined,
  });
  if (error) {
    console.warn("[chork] getLeaderboardUserRow failed:", error);
    return null;
  }
  const rows = normaliseLeaderboardRows(data ?? []);
  return rows[0] ?? null;
}

/** Normalise RPC rows — rank comes back as bigint (string in JSON). */
function normaliseLeaderboardRows(
  rows: Array<{
    user_id: string;
    username: string;
    name: string;
    avatar_url: string;
    rank: number | string | null;
    sends: number;
    flashes: number;
    zones: number;
    points: number;
  }>
): LeaderboardEntry[] {
  return rows.map((r) => ({
    ...r,
    rank: r.rank === null ? null : Number(r.rank),
  }));
}
