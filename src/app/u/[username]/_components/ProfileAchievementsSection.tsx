import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileSummary,
  getEarnedAchievements,
  getAllSets,
  getRoutesBySet,
  getRoutesBySetIds,
} from "@/lib/data/queries";
import { evaluateBadges } from "@/lib/badges";
import type { Route } from "@/lib/data";
import { ProfileAchievements } from "@/components/Achievements/ProfileAchievements";

interface Props {
  userId: string;
  gymId: string;
  createdAt: string;
}

export async function ProfileAchievementsSection({ userId, gymId, createdAt }: Props) {
  const supabase = await createServerSupabase();

  const [summary, earnedAchievements, allSets] = await Promise.all([
    getProfileSummary(supabase, userId, gymId),
    getEarnedAchievements(supabase, userId),
    getAllSets(gymId, createdAt),
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
    totalFlashes: totals.flashes,
    totalSends: totals.sends,
    totalPoints: totals.points,
    completedRoutesBySet,
    totalRoutesBySet,
    flashedRoutesBySet,
    zoneAvailableBySet,
    zoneClaimedBySet,
  }).map((b) => {
    if (b.earned) {
      const earnedAt = earnedAchievements.get(b.badge.id);
      return earnedAt ? { ...b, earnedAt } : b;
    }
    return b;
  });

  return <ProfileAchievements badges={badges} />;
}
