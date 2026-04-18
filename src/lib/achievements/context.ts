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
import { getJamAchievementContext } from "@/lib/data/jam-queries";

type Supabase = SupabaseClient<Database>;

/**
 * Empty gym-scoped shape — used when the caller has no active gym
 * (jam-only users) so the rest of the evaluator can still run on
 * jam data without a null-guard on every Map access.
 */
const EMPTY_GYM_MAPS = {
  completedRoutesBySet: new Map<string, Set<number>>(),
  totalRoutesBySet: new Map<string, number>(),
  flashedRoutesBySet: new Map<string, Set<number>>(),
  zoneAvailableBySet: new Map<string, Set<number>>(),
  zoneClaimedBySet: new Map<string, Set<number>>(),
};

export async function buildBadgeContext(
  supabase: Supabase,
  userId: string,
  gymId: string | null
): Promise<BadgeContext | null> {
  // Pull jam context always — it feeds progress totals + condition
  // badges regardless of whether the caller has a gym.
  const jamAchievements = await getJamAchievementContext(supabase, userId);

  if (!gymId) {
    return {
      totalFlashes: jamAchievements.jam_total_flashes,
      totalSends: jamAchievements.jam_total_sends,
      totalPoints: jamAchievements.jam_total_points,
      ...EMPTY_GYM_MAPS,
      jamsPlayed: jamAchievements.jams_played,
      jamsWon: jamAchievements.jams_won,
      jamsHosted: jamAchievements.jams_hosted,
      maxPlayersInWonJam: jamAchievements.max_players_in_won_jam,
      uniqueJamCoplayers: jamAchievements.unique_coplayers,
      ironCrewMaxPairCount: jamAchievements.max_iron_crew_pair_count,
    };
  }

  const allSets = await getAllSets(gymId);
  if (allSets.length === 0) {
    return {
      totalFlashes: jamAchievements.jam_total_flashes,
      totalSends: jamAchievements.jam_total_sends,
      totalPoints: jamAchievements.jam_total_points,
      ...EMPTY_GYM_MAPS,
      jamsPlayed: jamAchievements.jams_played,
      jamsWon: jamAchievements.jams_won,
      jamsHosted: jamAchievements.jams_hosted,
      maxPlayersInWonJam: jamAchievements.max_players_in_won_jam,
      uniqueJamCoplayers: jamAchievements.unique_coplayers,
      ironCrewMaxPairCount: jamAchievements.max_iron_crew_pair_count,
    };
  }

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

  // Pre-bucket logs by set_id so we don't re-scan the full log list
  // inside the per-set loop below. Before: O(sets × logs) — a climber
  // with, say, 40 sets and 600 lifetime logs was scanning 24k entries
  // on every badge eval. After: O(sets + logs).
  const logsBySet = new Map<string, typeof routeData.logs>();
  for (const log of routeData.logs) {
    if (!log.set_id) continue;
    const bucket = logsBySet.get(log.set_id);
    if (bucket) bucket.push(log);
    else logsBySet.set(log.set_id, [log]);
  }

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
    for (const log of logsBySet.get(set.id) ?? []) {
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
    // Flash / send / points totals union the gym aggregate with the
    // jam aggregate. A flash is a flash is a flash — Thunder
    // progression, First (A)send, Century all count activity from
    // both sources.
    totalFlashes: aggregates.flashes + jamAchievements.jam_total_flashes,
    totalSends: aggregates.sends + jamAchievements.jam_total_sends,
    totalPoints: aggregates.points + jamAchievements.jam_total_points,
    completedRoutesBySet,
    totalRoutesBySet,
    flashedRoutesBySet,
    zoneAvailableBySet,
    zoneClaimedBySet,
    jamsPlayed: jamAchievements.jams_played,
    jamsWon: jamAchievements.jams_won,
    jamsHosted: jamAchievements.jams_hosted,
    maxPlayersInWonJam: jamAchievements.max_players_in_won_jam,
    uniqueJamCoplayers: jamAchievements.unique_coplayers,
    ironCrewMaxPairCount: jamAchievements.max_iron_crew_pair_count,
  };
}
