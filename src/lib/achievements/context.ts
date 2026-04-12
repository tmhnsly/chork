/**
 * Build a `BadgeContext` for a user from live data.
 * Extracted here (rather than inlined in the server action) so it's reusable
 * if we add other evaluation entry points later.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { BadgeContext } from "@/lib/badges";
import {
  getAllSets,
  getRoutesBySet,
  getAllRouteDataForUserInGym,
} from "@/lib/data/queries";
import { computeAllTimeAggregates } from "@/lib/data/profile-stats";

type Supabase = SupabaseClient<Database>;

export async function buildBadgeContext(
  supabase: Supabase,
  userId: string,
  gymId: string
): Promise<BadgeContext | null> {
  const allSets = await getAllSets(supabase, gymId);
  if (allSets.length === 0) return null;

  const [routeData, ...setRoutes] = await Promise.all([
    getAllRouteDataForUserInGym(supabase, gymId, userId, allSets.map((s) => s.id)),
    ...allSets.map((s) => getRoutesBySet(supabase, s.id)),
  ]);

  const aggregates = computeAllTimeAggregates(routeData.logs);

  const completedRoutesBySet = new Map<string, Set<number>>();
  const totalRoutesBySet = new Map<string, number>();

  allSets.forEach((set, i) => {
    const routes = setRoutes[i] ?? [];
    totalRoutesBySet.set(set.id, routes.length);
    const routeNumberById = new Map(routes.map((r) => [r.id, r.number]));
    const completed = new Set<number>();
    for (const log of routeData.logs) {
      if (log.set_id !== set.id || !log.completed) continue;
      const num = routeNumberById.get(log.route_id);
      if (num !== undefined) completed.add(num);
    }
    completedRoutesBySet.set(set.id, completed);
  });

  return {
    totalFlashes: aggregates.flashes,
    totalSends: aggregates.sends,
    totalPoints: aggregates.points,
    completedRoutesBySet,
    totalRoutesBySet,
  };
}
