/**
 * Build a `BadgeContext` for a user from live data.
 * Extracted here (rather than inlined in the server action) so it's
 * reusable if we add other evaluation entry points later.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { BadgeContext } from "@/lib/badges";
import {
  getAllSets,
  getRoutesBySetIds,
  getAllRouteDataForUserInGym,
} from "@/lib/data/queries";
import { computeAllTimeAggregates } from "@/lib/data/profile-stats";

type Supabase = SupabaseClient<Database>;

export async function buildBadgeContext(
  supabase: Supabase,
  userId: string,
  gymId: string
): Promise<BadgeContext | null> {
  const allSets = await getAllSets(gymId);
  if (allSets.length === 0) return null;

  // One batched routes query for all sets instead of N parallel
  // getRoutesBySet calls. The .in("set_id", ids) shape this RPC uses
  // matches the pattern getAllRouteDataForUserInGym was written to
  // replace elsewhere — same fix here.
  const setIds = allSets.map((s) => s.id);
  const [routeData, routesBySetId] = await Promise.all([
    getAllRouteDataForUserInGym(supabase, gymId, userId, setIds),
    getRoutesBySetIds(supabase, setIds),
  ]);

  const aggregates = computeAllTimeAggregates(routeData.logs);

  const completedRoutesBySet = new Map<string, Set<number>>();
  const flashedRoutesBySet = new Map<string, Set<number>>();
  const totalRoutesBySet = new Map<string, number>();
  const zoneAvailableBySet = new Map<string, Set<number>>();
  const zoneClaimedBySet = new Map<string, Set<number>>();

  allSets.forEach((set) => {
    const routes = routesBySetId.get(set.id) ?? [];
    totalRoutesBySet.set(set.id, routes.length);
    const routeNumberById = new Map(routes.map((r) => [r.id, r.number]));

    // Zone-availability is a property of the routes themselves —
    // compute once per set regardless of whether the climber's logs
    // reference them.
    const zoneAvailable = new Set<number>();
    for (const r of routes) {
      if (r.has_zone) zoneAvailable.add(r.number);
    }
    zoneAvailableBySet.set(set.id, zoneAvailable);

    const completed = new Set<number>();
    const flashed = new Set<number>();
    const zoneClaimed = new Set<number>();
    for (const log of routeData.logs) {
      if (log.set_id !== set.id) continue;
      const num = routeNumberById.get(log.route_id);
      if (num === undefined) continue;
      if (log.zone) zoneClaimed.add(num);
      if (!log.completed) continue;
      completed.add(num);
      if (log.attempts === 1) flashed.add(num);
    }
    completedRoutesBySet.set(set.id, completed);
    flashedRoutesBySet.set(set.id, flashed);
    zoneClaimedBySet.set(set.id, zoneClaimed);
  });

  return {
    totalFlashes: aggregates.flashes,
    totalSends: aggregates.sends,
    totalPoints: aggregates.points,
    completedRoutesBySet,
    totalRoutesBySet,
    flashedRoutesBySet,
    zoneAvailableBySet,
    zoneClaimedBySet,
  };
}
