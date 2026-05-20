import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { RouteLog, ActivityEventWithRoute } from "./types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { rpcMany } from "./rpc";

type Supabase = SupabaseClient<Database>;

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
    logger.warn("getlogsbysetforuser_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return (data ?? []) as RouteLog[];
}

export interface UserLogInGym {
  route_id: string;
  set_id: string;
  attempts: number;
  completed: boolean;
  zone: boolean;
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
    // Inner-join `routes` and constrain by `set_id` IN setIds so logs
    // from sets the caller filtered out (e.g. sets that ended before
    // the climber's account existed) don't leak into the aggregates.
    // Without this filter, `uniqueRoutesAttempted` could exceed
    // `totalRoutesInGym` — a "20/14 coverage" bug on long-history gyms.
    supabase
      .from("route_logs")
      .select("route_id, attempts, completed, zone, routes!inner(set_id)")
      .eq("user_id", userId)
      .eq("gym_id", gymId)
      .in("routes.set_id", setIds),
    supabase
      .from("routes")
      .select("id", { count: "exact", head: true })
      .in("set_id", setIds),
  ]);

  if (logsResult.error) {
    logger.warn("getallroutedataforuseringym_logs_failed", { err: formatErrorForLog(logsResult.error) });
  }
  if (routesResult.error) {
    logger.warn("getallroutedataforuseringym_count_failed", { err: formatErrorForLog(routesResult.error) });
  }

  type LogRow = {
    route_id: string;
    attempts: number;
    completed: boolean;
    zone: boolean;
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
    };
  }).filter((l) => l.set_id !== "");

  return {
    logs,
    totalRoutesInGym: routesResult.count ?? 0,
  };
}

export async function getUserSetStats(
  supabase: Supabase,
  userId: string,
  gymId: string
): Promise<{ set_id: string; completions: number; flashes: number; points: number }[]> {
  return rpcMany<{ set_id: string; completions: number; flashes: number; points: number }>(
    supabase.rpc("get_user_set_stats", { p_user_id: userId, p_gym_id: gymId }),
    "getusersetstats_failed",
  );
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
    logger.warn("getactivityeventsforuser_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return (data ?? []) as ActivityEventWithRoute[];
}
