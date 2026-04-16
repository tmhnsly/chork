import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { createServerSupabase, getServerUser } from "@/lib/supabase/server";
import {
  getProfileByUsername,
  getAllSets,
  getRoutesBySet,
  getLogsBySetForUser,
  getAllRouteDataForUserInGym,
  getEarnedAchievements,
  getRoutesBySetIds,
  getGym,
  getLeaderboardUserRow,
} from "@/lib/data/queries";
import { getCrewCountForUser, getPendingCrewInvites } from "@/lib/data/crew-queries";
import { getAdminGymsForUser } from "@/lib/data/admin-queries";
import { getNotifications } from "@/lib/data/notifications";
import type { UserLogInGym } from "@/lib/data/queries";
import { computeMaxPoints } from "@/lib/data";
import type { Route, RouteLog } from "@/lib/data";
import { evaluateBadges, evaluateBadgesForSet } from "@/lib/badges";
import {
  computeAllTimeAggregates,
  flashRate,
  pointsPerSend,
  completionRate,
  computeSetStreak,
} from "@/lib/data/profile-stats";
import { ProfileHeader } from "@/components/ProfileHeader/ProfileHeader";
import { ClimberStats } from "@/components/ClimberStats/ClimberStats";
import { ProfileAchievements } from "@/components/Achievements/ProfileAchievements";
import { PreviousSetsGrid } from "@/components/sections/PreviousSetsGrid";
import type { SetCell, SetCellLog } from "@/components/sections/PreviousSetsGrid";
import styles from "./user.module.scss";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `@${username} - Chork` };
}

function formatSetLabel(starts: string, ends: string) {
  return [
    format(parseISO(starts), "MMM d").toUpperCase(),
    format(parseISO(ends), "MMM d").toUpperCase(),
  ].join(" – ");
}

interface SetStats {
  completions: number;
  flashes: number;
  points: number;
  zones: number;
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;

  const supabase = await createServerSupabase();
  const authUser = await getServerUser();

  const profileUser = await getProfileByUsername(username);
  if (!profileUser) notFound();

  const isOwnProfile = authUser?.id === profileUser.id;

  const gymId = profileUser.active_gym_id;

  if (!gymId) {
    return (
      <main className={styles.page}>
        <ProfileHeader user={profileUser} isOwnProfile={isOwnProfile} />
        <p>No gym selected</p>
      </main>
    );
  }

  // Fetch everything we need in parallel.
  // Only show sets that were still active when the user joined — sets that
  // finished before their account existed are not meaningful to them.
  // Filter runs in SQL via `ends_at >= created_at`.
  const allSets = await getAllSets(gymId, profileUser.created_at);
  const activeSet = allSets.find((s) => s.active) ?? null;
  const previousSetRecords = allSets.filter((s) => !s.active);

  // One batched routes query for all previous sets (was N round-trips,
  // one per previous set — hot spot for climbers with long histories).
  const [miniRoutes, miniLogs, routeData, previousSetRoutesById, earnedAchievements] = await Promise.all([
    activeSet ? getRoutesBySet(activeSet.id) : Promise.resolve<Route[]>([]),
    activeSet ? getLogsBySetForUser(supabase, activeSet.id, profileUser.id) : Promise.resolve<RouteLog[]>([]),
    getAllRouteDataForUserInGym(supabase, gymId, profileUser.id, allSets.map((s) => s.id)),
    getRoutesBySetIds(supabase, previousSetRecords.map((s) => s.id)),
    getEarnedAchievements(supabase, profileUser.id),
  ]);
  const previousSetRoutes: Route[][] = previousSetRecords.map(
    (s) => previousSetRoutesById.get(s.id) ?? []
  );

  // ── Per-set stats (single source of truth — raw logs) ─
  const statsBySet = new Map<string, SetStats>();

  for (const log of routeData.logs) {
    const existing = statsBySet.get(log.set_id) ?? { completions: 0, flashes: 0, points: 0, zones: 0 };
    // Zone is independent of completion — partial sends that touched
    // the zone still score +1 and count toward the zone total.
    if (log.zone) {
      existing.zones++;
      existing.points += 1;
    }
    if (log.completed) {
      existing.completions++;
      if (log.attempts === 1) existing.flashes++;
      if (log.attempts === 1) existing.points += 4;
      else if (log.attempts === 2) existing.points += 3;
      else if (log.attempts === 3) existing.points += 2;
      else existing.points += 1;
    }
    statsBySet.set(log.set_id, existing);
  }

  // ── Group logs by set for thumbnails / charts ────
  const logsBySet = new Map<string, UserLogInGym[]>();
  for (const log of routeData.logs) {
    const arr = logsBySet.get(log.set_id) ?? [];
    arr.push(log);
    logsBySet.set(log.set_id, arr);
  }

  // ── All-time aggregates (derived from raw logs) ──
  const aggregates = computeAllTimeAggregates(routeData.logs);
  const streak = computeSetStreak(
    // allSets is ordered newest-first by getAllSets
    allSets.map((s) => ({
      hasSend: (statsBySet.get(s.id)?.completions ?? 0) > 0,
    }))
  );

  const allTimeExtras = {
    flashRate: flashRate(aggregates.sends, aggregates.flashes),
    pointsPerSend: pointsPerSend(aggregates.points, aggregates.sends),
    totalAttempts: aggregates.totalAttempts,
    completionRate: completionRate(aggregates.sends, aggregates.uniqueRoutesAttempted),
    uniqueRoutesAttempted: aggregates.uniqueRoutesAttempted,
    totalRoutesInGym: routeData.totalRoutesInGym,
    streakCurrent: streak.current,
    streakBest: streak.best,
  };

  // ── Badge context (all-time badges on the Achievements shelf) ─
  // Build the full per-set view across *every* set the climber has
  // attempted, so condition-based achievements (Saviour, Not Easy
  // Being Green, In the Zone, rhyme pairs) can evaluate correctly
  // even when those were earned on a previous set. The active set's
  // data is layered in alongside each previous set's routes below.
  const completedRoutesBySet = new Map<string, Set<number>>();
  const flashedRoutesBySet = new Map<string, Set<number>>();
  const totalRoutesBySet = new Map<string, number>();
  const zoneAvailableBySet = new Map<string, Set<number>>();
  const zoneClaimedBySet = new Map<string, Set<number>>();

  const registerSet = (setId: string, routes: Route[]) => {
    totalRoutesBySet.set(setId, routes.length);
    const routeNumberById = new Map(routes.map((r) => [r.id, r.number]));
    const zoneAvailable = new Set<number>();
    for (const r of routes) {
      if (r.has_zone) zoneAvailable.add(r.number);
    }
    zoneAvailableBySet.set(setId, zoneAvailable);
    const completed = new Set<number>();
    const flashed = new Set<number>();
    const zoneClaimed = new Set<number>();
    for (const log of routeData.logs) {
      if (log.set_id !== setId) continue;
      const num = routeNumberById.get(log.route_id);
      if (num === undefined) continue;
      if (log.zone) zoneClaimed.add(num);
      if (!log.completed) continue;
      completed.add(num);
      if (log.attempts === 1) flashed.add(num);
    }
    completedRoutesBySet.set(setId, completed);
    flashedRoutesBySet.set(setId, flashed);
    zoneClaimedBySet.set(setId, zoneClaimed);
  };

  if (activeSet) registerSet(activeSet.id, miniRoutes);
  previousSetRecords.forEach((set, i) => registerSet(set.id, previousSetRoutes[i]));

  const badges = evaluateBadges({
    totalFlashes: aggregates.flashes,
    totalSends: aggregates.sends,
    totalPoints: aggregates.points,
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

  // ── Current set card data ────────────────────────
  // rankRow is fetched below alongside the other per-profile data and
  // threaded in once we've awaited the batch.
  const currentSetBase = activeSet
    ? {
        ...(statsBySet.get(activeSet.id) ?? { completions: 0, flashes: 0, points: 0, zones: 0 }),
        totalRoutes: miniRoutes.length,
        resetDate: format(parseISO(activeSet.ends_at), "MMM d"),
      }
    : null;

  // ── Build SetCell[] for the grid (active first, then previous) ─
  function buildSetCell(
    setRecord: { id: string; starts_at: string; ends_at: string },
    routes: Route[],
    isActive: boolean
  ): SetCell {
    const stats = statsBySet.get(setRecord.id) ?? { completions: 0, flashes: 0, points: 0, zones: 0 };
    const setLogs = logsBySet.get(setRecord.id) ?? [];
    const logs: Map<string, SetCellLog> = new Map(
      setLogs.map((l) => [l.route_id, { attempts: l.attempts, completed: l.completed, zone: l.zone }])
    );
    const totalRoutes = routes.length;
    const maxPoints = computeMaxPoints(totalRoutes, routes.filter((r) => r.has_zone).length);

    // Per-set earned badges — condition-based only. Includes flash
    // / zone info so new achievements (Saviour, Not Easy Being
    // Green, In the Zone) surface on the set's detail card.
    const completed = new Set<number>();
    const flashed = new Set<number>();
    const zoneClaimed = new Set<number>();
    const zoneAvailable = new Set<number>();
    for (const r of routes) {
      if (r.has_zone) zoneAvailable.add(r.number);
    }
    for (const log of setLogs) {
      const route = routes.find((r) => r.id === log.route_id);
      if (!route) continue;
      if (log.zone) zoneClaimed.add(route.number);
      if (!log.completed) continue;
      completed.add(route.number);
      if (log.attempts === 1) flashed.add(route.number);
    }
    const badgesForSet = evaluateBadgesForSet({
      completed,
      flashed,
      zoneAvailable,
      zoneClaimed,
      totalRoutes,
    });

    return {
      id: setRecord.id,
      label: formatSetLabel(setRecord.starts_at, setRecord.ends_at),
      isActive,
      hasActivity: stats.completions > 0 || setLogs.some((l) => l.attempts > 0),
      completions: stats.completions,
      flashes: stats.flashes,
      zones: stats.zones,
      points: stats.points,
      totalRoutes,
      maxPoints,
      routes,
      logs,
      badges: badgesForSet,
    };
  }

  const setCells: SetCell[] = [];
  if (activeSet) {
    setCells.push(buildSetCell(activeSet, miniRoutes, true));
  }
  previousSetRecords.forEach((set, i) => {
    setCells.push(buildSetCell(set, previousSetRoutes[i], false));
  });

  const logByRoute = new Map(miniLogs.map((l) => [l.route_id, l]));

  // Empty state: user on their first set (active set exists, no previous sets)
  const showSetsEmpty = activeSet !== null && previousSetRecords.length === 0;

  // Non-own profile: crew count below the username. Gym + set rank
  // used to live here too but now render inside the Current Set card
  // (gym in the header meta, rank next to the points total), so the
  // context line stays focused on social signals.
  const [gym, rankRow, crewCount, invites, adminGyms, notifications] = await Promise.all([
    getGym(gymId),
    // Rank is fetched for everyone when an active set exists — it
    // drives the `#N` shown next to points in the Current Set card,
    // regardless of whose profile we're viewing.
    activeSet
      ? getLeaderboardUserRow(supabase, gymId, profileUser.id, activeSet.id)
      : Promise.resolve(null),
    !isOwnProfile ? getCrewCountForUser(supabase, profileUser.id) : Promise.resolve(0),
    // Own-profile only: pending invites drive the notification bell
    // badge on the profile header. Other climbers never see this.
    isOwnProfile ? getPendingCrewInvites(supabase, profileUser.id) : Promise.resolve([]),
    // Own-profile only: an admin surfaces an "Admin" link inside the
    // settings sheet. Empty list = not an admin.
    isOwnProfile ? getAdminGymsForUser(supabase, profileUser.id) : Promise.resolve([]),
    // Own-profile only: persistent notification log (migration 033).
    // The bell badge counts unread rows; opening the sheet marks
    // them read server-side.
    isOwnProfile ? getNotifications(supabase, 50) : Promise.resolve([]),
  ]);
  const isAdmin = adminGyms.length > 0;

  let contextLine: string | null = null;
  if (!isOwnProfile && crewCount > 0) {
    contextLine = `${crewCount} crew${crewCount === 1 ? "" : "s"}`;
  }

  // Thread the rank (fetched in parallel above) into the current-set
  // card payload. Kept separate from the base object so activeSet===null
  // still resolves to `null` cleanly.
  const currentSetStats = currentSetBase
    ? { ...currentSetBase, rank: rankRow?.rank ?? null }
    : null;

  // Show another climber's profile in *their* chosen theme — the
  // viewer's own theme restores when they leave the route. We scope
  // the `data-theme` to the profile main only (not the global nav)
  // so chrome stays in the viewer's palette while the visited
  // profile sits in theirs.
  const otherThemeAttr =
    !isOwnProfile && profileUser.theme && profileUser.theme !== "default"
      ? { "data-theme": profileUser.theme }
      : {};

  return (
    <main className={styles.page} {...otherThemeAttr}>
      <ProfileHeader
        user={profileUser}
        isOwnProfile={isOwnProfile}
        contextLine={contextLine}
        invites={invites}
        notifications={notifications}
        isAdmin={isAdmin}
      />

      <ClimberStats
        currentSet={currentSetStats}
        allTimeCompletions={aggregates.sends}
        allTimeFlashes={aggregates.flashes}
        allTimePoints={aggregates.points}
        allTimeExtras={allTimeExtras}
        gymName={gym?.name}
        routeIds={miniRoutes.length > 0 ? miniRoutes.map((r) => r.id) : undefined}
        routeHasZone={miniRoutes.length > 0 ? miniRoutes.map((r) => r.has_zone) : undefined}
        routeNumbers={miniRoutes.length > 0 ? miniRoutes.map((r) => r.number) : undefined}
        logs={miniRoutes.length > 0 ? logByRoute : undefined}
      />

      <ProfileAchievements badges={badges} />

      <PreviousSetsGrid
        sets={setCells}
        gymId={gymId}
        userId={profileUser.id}
        showEmptyState={showSetsEmpty}
      />
    </main>
  );
}
