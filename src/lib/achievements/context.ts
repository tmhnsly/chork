/**
 * Build a `BadgeContext` for a user from live data.
 * Extracted here (rather than inlined in the server action) so it's
 * reusable if we add other evaluation entry points later.
 *
 * This module is now only the I/O: five reads, then a handoff to the
 * pure `foldGymSets` in `./fold.ts`, which is where the per-set
 * bucketing logic (and its tests) live.
 *
 * Client caveat: `getAllSets(gymId)` does NOT use the `supabase`
 * argument — it's a `cachedQuery` helper that builds its own
 * service-role client inside the cache body (cache entries are shared
 * across viewers, so they can't carry a caller's auth). The other
 * four reads do use the passed client. Callers therefore pass
 * whichever client suits the rest: `route-log-actions` passes the
 * user's, `jam/actions` passes the service client for cross-user
 * evaluation after a jam ends.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { BadgeContext } from "@/lib/badges";
import { getAllSets } from "@/lib/data/set-queries";
import { getRoutesBySetIds } from "@/lib/data/route-queries";
import { getAllRouteDataForUserInGym } from "@/lib/data/route-log-queries";
import { computeAllTimeAggregates } from "@/lib/data/profile-stats";
import { createServiceClient } from "@/lib/supabase/server";
import { getJamAchievementContext } from "@/lib/data/jam-queries";
import type { JamAchievementContext } from "@/lib/data/jam-types";
import { emptyGymFold, foldGymSets, type GymSetFold } from "./fold";

type Supabase = SupabaseClient<Database>;

/**
 * Jam-sourced fields, mapped from the RPC's snake_case row to the
 * evaluator's shape. One home: this mapping used to be written out
 * three times (gymless, no-sets, and the full path), so adding a jam
 * aggregate meant remembering all three.
 */
function jamFields(jam: JamAchievementContext) {
  return {
    jamsPlayed: jam.jams_played,
    jamsWon: jam.jams_won,
    jamsHosted: jam.jams_hosted,
    maxPlayersInWonJam: jam.max_players_in_won_jam,
    uniqueJamCoplayers: jam.unique_coplayers,
    ironCrewMaxPairCount: jam.max_iron_crew_pair_count,
  };
}

/** Totals union gym activity with jam activity. A flash is a flash is
 *  a flash — Thunder progression, First (A)send and Century all count
 *  both sources. */
function assemble(
  jam: JamAchievementContext,
  gym: GymSetFold,
  gymTotals: { flashes: number; sends: number; points: number } | null,
): BadgeContext {
  return {
    totalFlashes: (gymTotals?.flashes ?? 0) + jam.jam_total_flashes,
    totalSends: (gymTotals?.sends ?? 0) + jam.jam_total_sends,
    totalPoints: (gymTotals?.points ?? 0) + jam.jam_total_points,
    ...gym,
    ...jamFields(jam),
  };
}

export async function buildBadgeContext(
  supabase: Supabase,
  userId: string,
  gymId: string | null
): Promise<BadgeContext | null> {
  // Pull Match context always — it feeds progress totals + condition
  // badges regardless of whether the caller has a gym.
  //
  // Service client, not the caller's: `get_match_achievement_context`
  // takes its subject explicitly and is revoked from `authenticated`,
  // because this runs for OTHER users too (the post-Match evaluation
  // re-scores every participant).
  const jamAchievements = await getJamAchievementContext(
    createServiceClient(),
    userId,
  );

  if (!gymId) return assemble(jamAchievements, emptyGymFold(), null);

  const allSets = await getAllSets(gymId);
  if (allSets.length === 0) {
    return assemble(jamAchievements, emptyGymFold(), null);
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
  const gymFold = foldGymSets(allSets, routesBySetId, routeData.logs);

  return assemble(jamAchievements, gymFold, aggregates);
}
