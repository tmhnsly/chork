import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileSummary,
  getEarnedAchievements,
  getAllSets,
  getRoutesBySet,
  getRoutesBySetIds,
} from "@/lib/data/queries";
import { getJamAchievementContext } from "@/lib/data/jam-queries";
import { evaluateBadges } from "@/lib/badges";
import type { Route } from "@/lib/data";
import { ProfileAchievements } from "@/components/Achievements/ProfileAchievements";
import { BADGES } from "@/lib/badges";

interface Props {
  userId: string;
  /**
   * Null when the profile's owner hasn't set an active gym — gymless
   * climbers earn achievements from jam activity only. In that mode
   * the re-evaluation pipeline below is skipped and the shelf reads
   * straight from `user_achievements` — the persisted earned_at is
   * the source of truth regardless of whether the badge is currently
   * re-derivable from context.
   */
  gymId: string | null;
  createdAt: string;
}

export async function ProfileAchievementsSection({ userId, gymId, createdAt }: Props) {
  const supabase = await createServerSupabase();

  // Gymless path — just hydrate persisted earned_at values onto the
  // badge catalogue. Re-evaluation needs gym-scoped set/route data;
  // without a gym there's nothing new to discover at render time.
  // Jam-end achievements are evaluated server-side when the jam
  // ends, so they're in the table by the time the profile reads it.
  if (!gymId) {
    const earnedAchievements = await getEarnedAchievements(supabase, userId);
    const badges = BADGES.map((badge) => {
      const earnedAt = earnedAchievements.get(badge.id);
      return earnedAt
        ? { badge, earned: true as const, earnedAt }
        : { badge, earned: false as const, progress: null, current: null };
    });
    return <ProfileAchievements badges={badges} />;
  }

  const [summary, earnedAchievements, allSets, jamAchievements] = await Promise.all([
    getProfileSummary(supabase, userId, gymId),
    getEarnedAchievements(supabase, userId),
    getAllSets(gymId, createdAt),
    getJamAchievementContext(supabase, userId),
  ]);

  const activeSet = allSets.find((s) => s.active) ?? null;
  const previousSets = allSets.filter((s) => !s.active);

  // Active set's routes for per-route condition badges. Past sets get
  // batched route lookup so condition badges that need route_number
  // membership can still register the (set_id → totalRoutes) +
  // (set_id → zone availability) — earned-state for past sets is
  // overlaid from earnedAchievements below, so we mostly need totals.
  const [activeRoutes, previousRoutesById] = await Promise.all([
    activeSet ? getRoutesBySet(activeSet.id) : Promise.resolve<Route[]>([]),
    getRoutesBySetIds(supabase, previousSets.map((s) => s.id)),
  ]);

  const completedRoutesBySet = new Map<string, Set<number>>();
  const flashedRoutesBySet = new Map<string, Set<number>>();
  const totalRoutesBySet = new Map<string, number>();
  const zoneAvailableBySet = new Map<string, Set<number>>();
  const zoneClaimedBySet = new Map<string, Set<number>>();

  // Active set: full per-route detail from active_set_detail.
  if (activeSet) {
    const routeNumberById = new Map(activeRoutes.map((r) => [r.id, r.number]));
    const zoneAvailable = new Set<number>();
    for (const r of activeRoutes) if (r.has_zone) zoneAvailable.add(r.number);
    const completed = new Set<number>();
    const flashed = new Set<number>();
    const zoneClaimed = new Set<number>();
    for (const log of summary.active_set_detail) {
      const num = routeNumberById.get(log.route_id);
      if (num === undefined) continue;
      if (log.zone) zoneClaimed.add(num);
      if (!log.completed) continue;
      completed.add(num);
      if (log.attempts === 1) flashed.add(num);
    }
    totalRoutesBySet.set(activeSet.id, activeRoutes.length);
    zoneAvailableBySet.set(activeSet.id, zoneAvailable);
    completedRoutesBySet.set(activeSet.id, completed);
    flashedRoutesBySet.set(activeSet.id, flashed);
    zoneClaimedBySet.set(activeSet.id, zoneClaimed);
  }

  // Past sets: only totalRoutes + zoneAvailable are knowable without
  // raw logs. Per-route completed/flashed/zoneClaimed stays empty —
  // route-number-specific condition badges for past sets won't
  // re-evaluate, but `earnedAchievements` overlays previously-earned
  // badges so they continue to display. Count-based badges
  // (totalSends/totalFlashes/totalPoints) work from per_set sums.
  for (const set of previousSets) {
    const routes = previousRoutesById.get(set.id) ?? [];
    const zoneAvailable = new Set<number>();
    for (const r of routes) if (r.has_zone) zoneAvailable.add(r.number);
    totalRoutesBySet.set(set.id, routes.length);
    zoneAvailableBySet.set(set.id, zoneAvailable);
    completedRoutesBySet.set(set.id, new Set());
    flashedRoutesBySet.set(set.id, new Set());
    zoneClaimedBySet.set(set.id, new Set());
  }

  const totals = summary.per_set.reduce(
    (acc, s) => {
      acc.sends += s.sends;
      acc.flashes += s.flashes;
      acc.points += s.points;
      return acc;
    },
    { sends: 0, flashes: 0, points: 0 },
  );

  const badges = evaluateBadges({
    // Union gym + jam totals for progress ladders so gym climbers
    // also see their jam activity feed into Thunder / First (A)send /
    // Century. Per-set maps stay gym-only — rhyme pair / Saviour
    // badges are anchored to the numbered-wall concept.
    totalFlashes: totals.flashes + jamAchievements.jam_total_flashes,
    totalSends: totals.sends + jamAchievements.jam_total_sends,
    totalPoints: totals.points + jamAchievements.jam_total_points,
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
  }).map((b) => {
    if (b.earned) {
      const earnedAt = earnedAchievements.get(b.badge.id);
      return earnedAt ? { ...b, earnedAt } : b;
    }
    return b;
  });

  return <ProfileAchievements badges={badges} />;
}
