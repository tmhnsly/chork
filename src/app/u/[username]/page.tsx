import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileByUsername,
  getAllSets,
  getAllLogsForUser,
  getUserSetStats,
  getRoutesBySet,
  getLogsBySetForUser,
} from "@/lib/data/queries";
import { isFlash, computePoints, computeMaxPoints } from "@/lib/data";
import type { RouteLogWithSetId } from "@/lib/data";
import { evaluateBadges, type BadgeContext } from "@/lib/badges";
import { ProfileHeader } from "@/components/ProfileHeader/ProfileHeader";
import { ClimberStats } from "@/components/ClimberStats/ClimberStats";
import { BadgeShelf } from "@/components/BadgeShelf/BadgeShelf";
import { CurrentSetSection } from "@/components/sections/CurrentSetSection";
import { PreviousSetsSection } from "@/components/sections/PreviousSetsSection";
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

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;

  const supabase = await createServerSupabase();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const profileUser = await getProfileByUsername(supabase, username);
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

  const allSets = await getAllSets(supabase, gymId);
  const activeSet = allSets.find((s) => s.active) ?? null;

  const [viewStats, miniRoutes, miniLogs] = await Promise.all([
    getUserSetStats(supabase, profileUser.id, gymId),
    activeSet ? getRoutesBySet(supabase, activeSet.id) : Promise.resolve([]),
    activeSet ? getLogsBySetForUser(supabase, activeSet.id, profileUser.id) : Promise.resolve([]),
  ]);

  // Build stats
  const statsBySet = new Map<string, { completions: number; flashes: number; points: number }>();
  let allTimeStats: { completions: number; flashes: number; points: number };

  const completedRoutesBySet = new Map<string, Set<number>>();
  const totalRoutesBySet = new Map<string, number>();

  if (viewStats.length > 0) {
    for (const row of viewStats) {
      statsBySet.set(row.set_id, {
        completions: row.completions ?? 0,
        flashes: row.flashes ?? 0,
        points: row.points ?? 0,
      });
    }
    allTimeStats = {
      completions: viewStats.reduce((s, r) => s + (r.completions ?? 0), 0),
      flashes: viewStats.reduce((s, r) => s + (r.flashes ?? 0), 0),
      points: viewStats.reduce((s, r) => s + (r.points ?? 0), 0),
    };
  } else {
    const allLogs = await getAllLogsForUser(supabase, profileUser.id);
    for (const log of allLogs) {
      const setId = (log as RouteLogWithSetId).routes?.id;
      if (!setId) continue;
      const existing = statsBySet.get(setId) ?? { completions: 0, flashes: 0, points: 0 };
      if (log.completed) existing.completions++;
      if (isFlash(log)) existing.flashes++;
      existing.points += computePoints(log);
      statsBySet.set(setId, existing);
    }
    allTimeStats = {
      completions: allLogs.filter((l) => l.completed).length,
      flashes: allLogs.filter((l) => isFlash(l)).length,
      points: allLogs.reduce((s, l) => s + computePoints(l), 0),
    };
  }

  // Badge context
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
    totalFlashes: allTimeStats.flashes,
    totalSends: allTimeStats.completions,
    totalPoints: allTimeStats.points,
    completedRoutesBySet,
    totalRoutesBySet,
  });

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

  const previousSets = allSets
    .filter((s) => !s.active)
    .map((set) => {
      const stats = statsBySet.get(set.id);
      if (!stats || stats.completions === 0) return null;
      return { id: set.id, label: formatSetLabel(set.starts_at, set.ends_at), ...stats };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <main className={styles.page}>
      <ProfileHeader user={profileUser} isOwnProfile={isOwnProfile} />

      <ClimberStats
        currentSet={currentSetStats}
        allTimeCompletions={allTimeStats.completions}
        allTimeFlashes={allTimeStats.flashes}
        allTimePoints={allTimeStats.points}
      >
        {miniRoutes.length > 0 && (
          <CurrentSetSection routes={miniRoutes} logs={miniLogs} />
        )}
      </ClimberStats>

      <BadgeShelf badges={badges} />

      <PreviousSetsSection sets={previousSets} />
    </main>
  );
}
