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
  CommentLike,
  PaginatedComments,
  ActivityEventWithRoute,
} from "./types";

type Supabase = SupabaseClient<Database>;

// ── Profiles ───────────────────────────────────────

export async function getProfile(supabase: Supabase, userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
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
  const { data } = await supabase
    .from("gyms")
    .select("*")
    .eq("is_listed", true)
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(20);
  return data ?? [];
}

export async function getGym(supabase: Supabase, gymId: string): Promise<Gym | null> {
  const { data } = await supabase
    .from("gyms")
    .select("*")
    .eq("id", gymId)
    .single();
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
  const { data } = await supabase
    .from("sets")
    .select("*")
    .eq("gym_id", gymId)
    .order("starts_at", { ascending: false });
  return data ?? [];
}

// ── Routes ─────────────────────────────────────────

export async function getRoutesBySet(supabase: Supabase, setId: string): Promise<Route[]> {
  const { data } = await supabase
    .from("routes")
    .select("*")
    .eq("set_id", setId)
    .order("number");
  return data ?? [];
}

// ── Route logs ─────────────────────────────────────

export async function getLogsBySetForUser(
  supabase: Supabase,
  setId: string,
  userId: string
): Promise<RouteLog[]> {
  const { data } = await supabase
    .from("route_logs")
    .select("*, routes!inner(set_id)")
    .eq("routes.set_id", setId)
    .eq("user_id", userId);
  return (data ?? []) as RouteLog[];
}

export async function getAllLogsForUser(
  supabase: Supabase,
  userId: string
): Promise<RouteLogWithSetId[]> {
  const { data } = await supabase
    .from("route_logs")
    .select("*, routes(id)")
    .eq("user_id", userId);
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
  const { data } = await supabase
    .from("activity_events")
    .select("*, routes(number)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
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

  // Get total count
  const { count } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("route_id", routeId);

  const totalItems = count ?? 0;
  const totalPages = Math.ceil(totalItems / perPage);

  // Get page of comments with author profiles
  const { data } = await supabase
    .from("comments")
    .select("*, profiles(id, username, name, avatar_url)")
    .eq("route_id", routeId)
    .order("likes", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  return {
    items: (data ?? []) as Comment[],
    totalItems,
    totalPages,
    page,
  };
}

// ── Comment likes ──────────────────────────────────

export async function getLikedCommentIds(
  supabase: Supabase,
  userId: string,
  routeId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from("comment_likes")
    .select("comment_id, comments!inner(route_id)")
    .eq("user_id", userId)
    .eq("comments.route_id", routeId);

  return new Set((data ?? []).map((r) => r.comment_id));
}
