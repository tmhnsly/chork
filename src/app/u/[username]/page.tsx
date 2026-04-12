import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileByUsername,
  getAllSets,
  getRoutesBySet,
  getLogsBySetForUser,
  getAllRouteDataForUserInGym,
  isFollowing,
  getEarnedAchievements,
} from "@/lib/data/queries";
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
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const profileUser = await getProfileByUsername(supabase, username);
  if (!profileUser) notFound();

  const isOwnProfile = authUser?.id === profileUser.id;

  // Follow state: only fetched when viewing another user's profile while signed in.
  // `undefined` → ProfileHeader hides the Follow button entirely.
  const followState = (!isOwnProfile && authUser)
    ? await isFollowing(supabase, authUser.id, profileUser.id)
    : undefined;

  const gymId = profileUser.active_gym_id;

  if (!gymId) {
    return (
      <main className={styles.page}>
        <ProfileHeader
          user={profileUser}
          isOwnProfile={isOwnProfile}
          isFollowing={followState}
          followerCount={profileUser.follower_count}
          followingCount={profileUser.following_count}
        />
        <p>No gym selected</p>
      </main>
    );
  }

  // Fetch everything we need in parallel.
  // Only show sets that were still active when the user joined — sets that
  // finished before their account existed are not meaningful to them.
  // Filter runs in SQL via `ends_at >= created_at`.
  const allSets = await getAllSets(supabase, gymId, profileUser.created_at);
  const activeSet = allSets.find((s) => s.active) ?? null;
  const previousSetRecords = allSets.filter((s) => !s.active);

  const [miniRoutes, miniLogs, routeData, previousSetRoutes, earnedAchievements] = await Promise.all([
    activeSet ? getRoutesBySet(supabase, activeSet.id) : Promise.resolve<Route[]>([]),
    activeSet ? getLogsBySetForUser(supabase, activeSet.id, profileUser.id) : Promise.resolve<RouteLog[]>([]),
    getAllRouteDataForUserInGym(supabase, gymId, profileUser.id, allSets.map((s) => s.id)),
    Promise.all(previousSetRecords.map((s) => getRoutesBySet(supabase, s.id))),
    getEarnedAchievements(supabase, profileUser.id),
  ]);

  // ── Per-set stats (single source of truth — raw logs) ─
  const statsBySet = new Map<string, SetStats>();

  for (const log of routeData.logs) {
    const existing = statsBySet.get(log.set_id) ?? { completions: 0, flashes: 0, points: 0, zones: 0 };
    if (log.completed) {
      existing.completions++;
      if (log.attempts === 1) existing.flashes++;
      if (log.zone) existing.zones++;
      if (log.attempts === 1) existing.points += 4;
      else if (log.attempts === 2) existing.points += 3;
      else if (log.attempts === 3) existing.points += 2;
      else existing.points += 1;
      if (log.zone) existing.points += 1;
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
  const completedRoutesBySet = new Map<string, Set<number>>();
  const totalRoutesBySet = new Map<string, number>();

  if (miniRoutes.length > 0 && activeSet) {
    totalRoutesBySet.set(activeSet.id, miniRoutes.length);
    const completed = new Set<number>();
    for (const log of miniLogs) {
      if (log.completed) {
        const route = miniRoutes.find((r) => r.id === log.route_id);
        if (route) completed.add(route.number);
      }
    }
    completedRoutesBySet.set(activeSet.id, completed);
  }

  const badges = evaluateBadges({
    totalFlashes: aggregates.flashes,
    totalSends: aggregates.sends,
    totalPoints: aggregates.points,
    completedRoutesBySet,
    totalRoutesBySet,
  }).map((b) => {
    if (b.earned) {
      const earnedAt = earnedAchievements.get(b.badge.id);
      return earnedAt ? { ...b, earnedAt } : b;
    }
    return b;
  });

  // ── Current set card data ────────────────────────
  const currentSetStats = activeSet
    ? {
        ...(statsBySet.get(activeSet.id) ?? { completions: 0, flashes: 0, points: 0 }),
        totalRoutes: miniRoutes.length,
        maxPoints: computeMaxPoints(
          miniRoutes.length,
          miniRoutes.filter((r) => r.has_zone).length
        ),
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

    // Per-set earned badges — condition-based only
    const completedNumbers = new Set<number>();
    for (const log of setLogs) {
      if (log.completed) {
        const route = routes.find((r) => r.id === log.route_id);
        if (route) completedNumbers.add(route.number);
      }
    }
    const badgesForSet = evaluateBadgesForSet(completedNumbers, totalRoutes);

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

  return (
    <main className={styles.page}>
      {/*
        ProfileHeader — own vs other profile invariants:
        - `isOwnProfile` hides follow button and shows settings gear + edit/delete
        - `isFollowing` is `undefined` for own profile (follow button hidden)
        - All personal management controls (edit, delete, reset password) are
          gated inside ProfileHeader on `isOwnProfile`.
      */}
      <ProfileHeader
        user={profileUser}
        isOwnProfile={isOwnProfile}
        isFollowing={followState}
        followerCount={profileUser.follower_count}
        followingCount={profileUser.following_count}
      />

      <ClimberStats
        currentSet={currentSetStats}
        allTimeCompletions={aggregates.sends}
        allTimeFlashes={aggregates.flashes}
        allTimePoints={aggregates.points}
        allTimeExtras={allTimeExtras}
        routeIds={miniRoutes.length > 0 ? miniRoutes.map((r) => r.id) : undefined}
        routeHasZone={miniRoutes.length > 0 ? miniRoutes.map((r) => r.has_zone) : undefined}
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
