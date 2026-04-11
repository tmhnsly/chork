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
  const { data, error } = await supabase
    .from("route_logs")
    .select("*, routes(id)")
    .eq("user_id", userId);
  if (error) {
    console.warn("[chork] getAllLogsForUser failed:", error);
    return [];
  }
  return (data ?? []) as RouteLogWithSetId[];
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
