import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { RouteLog } from "./types";

import { readMany, readFailed } from "./read";

type Supabase = SupabaseClient<Database>;

export async function getLogsBySetForUser(
  supabase: Supabase,
  setId: string,
  userId: string
): Promise<RouteLog[]> {
  return readMany<RouteLog>(
    supabase
      .from("route_logs")
      .select("*")
      .eq("set_id", setId)
      .eq("user_id", userId),
    "getlogsbysetforuser_failed",
  );
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
    // Constrained by `set_id` IN setIds so logs from sets the caller
    // filtered out (e.g. sets that ended before the climber's account
    // existed) don't leak into the aggregates. Without this filter,
    // `uniqueRoutesAttempted` could exceed `totalRoutesInGym` — a
    // "20/14 coverage" bug on long-history gyms.
    supabase
      .from("route_logs")
      .select("route_id, set_id, attempts, completed, zone")
      .eq("user_id", userId)
      .eq("gym_id", gymId)
      .in("set_id", setIds),
    supabase
      .from("routes")
      .select("id", { count: "exact", head: true })
      .in("set_id", setIds),
  ]);

  if (logsResult.error) {
    readFailed("getallroutedataforuseringym_logs_failed", logsResult.error);
  }
  if (routesResult.error) {
    readFailed("getallroutedataforuseringym_count_failed", routesResult.error);
  }

  return {
    // `set_id` is NOT NULL and trigger-derived (migration 081), so
    // the row shape already IS `UserLogInGym` — no flattening, and
    // no "drop the ones whose join missed" guard to get wrong.
    logs: logsResult.data ?? [],
    totalRoutesInGym: routesResult.count ?? 0,
  };
}
