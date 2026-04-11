import { notFound } from "next/navigation";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { FaBolt } from "react-icons/fa6";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileByUsername,
  getAllSets,
  getAllLogsForUser,
  getUserSetStats,
  getActivityEventsForUser,
  getRoutesBySet,
  getLogsBySetForUser,
} from "@/lib/data/queries";
import { isFlash, computePoints, computeMaxPoints } from "@/lib/data";
import type { RouteLogWithSetId, Route, RouteLog, TileState } from "@/lib/data";
import { evaluateBadges, type BadgeContext } from "@/lib/badges";
import { ProfileHeader } from "@/components/ProfileHeader/ProfileHeader";
import { ClimberStats } from "@/components/ClimberStats/ClimberStats";
import { BadgeShelf } from "@/components/BadgeShelf/BadgeShelf";
import { PunchTile } from "@/components/PunchTile/PunchTile";
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

function deriveStats(logs: RouteLogWithSetId[]) {
  const completions = logs.filter((l) => l.completed).length;
  const flashes = logs.filter((l) => isFlash(l)).length;
  const points = logs.reduce((s, l) => s + computePoints(l), 0);
  return { completions, flashes, points };
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

  const [viewStats, activityEvents, miniRoutes, miniLogs] = await Promise.all([
    getUserSetStats(supabase, profileUser.id, gymId),
    isOwnProfile ? getActivityEventsForUser(supabase, profileUser.id, 5) : Promise.resolve([]),
    activeSet ? getRoutesBySet(supabase, activeSet.id) : Promise.resolve([]),
    activeSet ? getLogsBySetForUser(supabase, activeSet.id, profileUser.id) : Promise.resolve([]),
  ]);

  // Build stats
  const useViewStats = viewStats.length > 0;
  const statsBySet = new Map<string, { completions: number; flashes: number; points: number }>();
  let allTimeStats: { completions: number; flashes: number; points: number };

  // Badge context
  const completedRoutesBySet = new Map<string, Set<number>>();
  const totalRoutesBySet = new Map<string, number>();

  if (useViewStats) {
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
      const setId = log.routes?.id;
      if (!setId) continue;
      const existing = statsBySet.get(setId) ?? { completions: 0, flashes: 0, points: 0 };
      if (log.completed) existing.completions++;
      if (isFlash(log)) existing.flashes++;
      existing.points += computePoints(log);
      statsBySet.set(setId, existing);
    }
    allTimeStats = deriveStats(allLogs);
  }

  // Build badge context from mini logs and route data
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

  const badgeCtx: BadgeContext = {
    totalFlashes: allTimeStats.flashes,
    totalSends: allTimeStats.completions,
    totalPoints: allTimeStats.points,
    completedRoutesBySet,
    totalRoutesBySet,
  };
  const badges = evaluateBadges(badgeCtx);

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
    .filter(Boolean);

  const logByRoute = new Map(miniLogs.map((l) => [l.route_id, l]));

  return (
    <main className={styles.page}>
      {/* Header: handle + name left, avatar + settings right */}
      <ProfileHeader user={profileUser} isOwnProfile={isOwnProfile} />

      {/* Stats: swipeable Current Wall / All Time */}
      <ClimberStats
        currentSet={currentSetStats}
        allTimeCompletions={allTimeStats.completions}
        allTimeFlashes={allTimeStats.flashes}
        allTimePoints={allTimeStats.points}
      >
        {miniRoutes.length > 0 && (
          <>
            <div className={styles.miniGrid}>
              {miniRoutes.map((route) => {
                const routeLog = logByRoute.get(route.id);
                return (
                  <PunchTile
                    key={route.id}
                    number={route.number}
                    state={deriveTileState(routeLog)}
                    zone={routeLog?.zone}
                    gradeLabel={routeLog?.grade_vote != null ? `V${routeLog.grade_vote}` : undefined}
                    compact
                  />
                );
              })}
            </div>
            <footer className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.swatchFlash}`} />
                Flashed
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.swatchCompleted}`} />
                Sent
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.swatchAttempted}`} />
                Attempted
              </span>
            </footer>
          </>
        )}
      </ClimberStats>

      {/* Badge shelf */}
      <BadgeShelf badges={badges} />

      {/* Past sets */}
      {previousSets.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Previous sets</h2>
          <div className={styles.setList}>
            {previousSets.map((s) => (
              <div key={s!.id} className={styles.setCard}>
                <span className={styles.setLabel}>{s!.label}</span>
                <div className={styles.setStats}>
                  <div className={styles.setStat}>
                    <span className={`${styles.setStatValue} ${styles.sendsValue}`}>{s!.completions}</span>
                    <span className={`${styles.setStatLabel} ${styles.sendsLabel}`}>sends</span>
                  </div>
                  <div className={styles.setStat}>
                    <span className={`${styles.setStatValue} ${styles.flashValue}`}>{s!.flashes}</span>
                    <span className={`${styles.setStatLabel} ${styles.flashLabel}`}>flash</span>
                  </div>
                  <div className={styles.setStat}>
                    <span className={`${styles.setStatValue} ${styles.pointsValue}`}>{s!.points}</span>
                    <span className={`${styles.setStatLabel} ${styles.pointsLabel}`}>pts</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity */}
      {isOwnProfile && activityEvents.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent activity</h2>
          <ul className={styles.activityList}>
            {activityEvents.map((event) => {
              const routeNum = event.routes?.number;
              let text: string;
              let isFlashEvent = false;

              switch (event.type) {
                case "flashed":
                  text = `Flashed route ${routeNum ?? "?"}`;
                  isFlashEvent = true;
                  break;
                case "completed":
                  text = `Sent route ${routeNum ?? "?"}`;
                  break;
                case "beta_spray":
                  text = `Left beta on route ${routeNum ?? "?"}`;
                  break;
                default:
                  text = `Activity on route ${routeNum ?? "?"}`;
              }

              const timeAgo = formatDistanceToNow(parseISO(event.created_at));

              return (
                <li key={event.id} className={styles.activityItem}>
                  <span className={isFlashEvent ? styles.activityFlash : styles.activityText}>
                    {isFlashEvent && <FaBolt className={styles.activityFlashIcon} />}
                    {text}
                  </span>
                  <span className={styles.activityTime}>{timeAgo}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

// ── Mini send grid ────────────────────────────────
function deriveTileState(log: RouteLog | undefined): TileState {
  if (!log || log.attempts === 0) return "empty";
  if (!log.completed) return "attempted";
  if (isFlash(log)) return "flash";
  return "completed";
}

