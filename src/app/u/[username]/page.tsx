import { notFound } from "next/navigation";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { FaBolt } from "react-icons/fa6";
import { createServerPBFromCookies } from "@/lib/pocketbase-server";
import { getAuthUser } from "@/lib/pocketbase";
import {
  getUserByUsername,
  getAllSets,
  getAllLogsForUser,
  getUserSetStats,
  getActivityEventsForUser,
  getRoutesBySet,
  getLogsBySetForUser,
} from "@/lib/data/queries";
import { isFlash, computePoints } from "@/lib/data";
import type { RouteLogWithSetId, Route, RouteLog, TileState } from "@/lib/data";
import { ProfileHeader } from "@/components/ProfileHeader/ProfileHeader";
import { ClimberStats } from "@/components/ClimberStats/ClimberStats";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import { SignOutButton } from "@/components/ui";
import styles from "./user.module.scss";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `@${username} — Chork` };
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

  const pb = await createServerPBFromCookies();
  const [profileUser, allSets] = await Promise.all([
    getUserByUsername(pb, username),
    getAllSets(pb),
  ]);

  if (!profileUser) notFound();

  const currentUser = getAuthUser(pb);
  const isOwnProfile = currentUser?.id === profileUser.id;

  const activeSet = allSets.find((s) => s.active) ?? null;

  // All data in one parallel batch — no waterfall
  const [viewStats, activityEvents, miniRoutes, miniLogs] = await Promise.all([
    getUserSetStats(pb, profileUser.id),
    isOwnProfile ? getActivityEventsForUser(pb, profileUser.id, 3) : Promise.resolve([]),
    activeSet ? getRoutesBySet(pb, activeSet.id) : Promise.resolve([]),
    activeSet ? getLogsBySetForUser(pb, activeSet.id, profileUser.id) : Promise.resolve([]),
  ]);

  // Build per-set stats from the view (or fall back to full log scan)
  const useViewStats = viewStats.length > 0;
  const statsBySet = new Map<string, { completions: number; flashes: number; points: number }>();
  let allTimeStats: { completions: number; flashes: number; points: number };

  if (useViewStats) {
    for (const row of viewStats) {
      statsBySet.set(row.set_id, {
        completions: row.completions,
        flashes: row.flashes,
        points: row.points,
      });
    }
    allTimeStats = {
      completions: viewStats.reduce((s, r) => s + r.completions, 0),
      flashes: viewStats.reduce((s, r) => s + r.flashes, 0),
      points: viewStats.reduce((s, r) => s + r.points, 0),
    };
  } else {
    const allLogs = await getAllLogsForUser(pb, profileUser.id);
    for (const log of allLogs) {
      const setId = log.expand?.route_id?.set_id;
      if (!setId) continue;
      const existing = statsBySet.get(setId) ?? { completions: 0, flashes: 0, points: 0 };
      if (log.completed) existing.completions++;
      if (isFlash(log)) existing.flashes++;
      existing.points += computePoints(log);
      statsBySet.set(setId, existing);
    }
    allTimeStats = deriveStats(allLogs);
  }

  const currentSetStats = activeSet
    ? statsBySet.get(activeSet.id) ?? { completions: 0, flashes: 0, points: 0 }
    : null;

  // Previous sets (inactive, with completions, most recent first)
  const previousSets = allSets
    .filter((s) => !s.active)
    .map((set) => {
      const stats = statsBySet.get(set.id);
      if (!stats || stats.completions === 0) return null;
      return { id: set.id, label: formatSetLabel(set.starts_at, set.ends_at), ...stats };
    })
    .filter(Boolean);

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
          <MiniPunchCard routes={miniRoutes} logs={miniLogs} />
        )}
      </ClimberStats>

      {previousSets.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Previous sets</h2>
          <div className={styles.setList}>
            {previousSets.map((s) => (
              <div key={s!.id} className={styles.setCard}>
                <span className={styles.setLabel}>{s!.label}</span>
                <div className={styles.setStats}>
                  <div className={styles.setStat}>
                    <span className={styles.setStatValue}>{s!.points}</span>
                    <span className={styles.setStatLabel}>pts</span>
                  </div>
                  <div className={styles.setStat}>
                    <span className={styles.setStatValue}>{s!.completions}</span>
                    <span className={styles.setStatLabel}>sends</span>
                  </div>
                  <div className={styles.setStat}>
                    <span className={`${styles.setStatValue} ${styles.flashValue}`}>
                      {s!.flashes}
                    </span>
                    <span className={styles.setStatLabel}>flash</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isOwnProfile && activityEvents.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent activity</h2>
          <ul className={styles.activityList}>
            {activityEvents.map((event) => {
              const route = event.expand?.route_id;
              const routeNum = route?.number;
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

              const timeAgo = formatDistanceToNow(parseISO(event.created));

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

      {isOwnProfile && (
        <div className={styles.signOutSection}>
          <SignOutButton />
        </div>
      )}
    </main>
  );
}

// ── Mini punch card ────────────────────────────────
function deriveTileState(log: RouteLog | undefined): TileState {
  if (!log || log.attempts === 0) return "empty";
  if (!log.completed) return "attempted";
  if (isFlash(log)) return "flash";
  return "completed";
}

function MiniPunchCard({ routes, logs }: { routes: Route[]; logs: RouteLog[] }) {
  const logByRoute = new Map(logs.map((l) => [l.route_id, l]));

  return (
    <div className={styles.miniGrid}>
      {routes.map((route) => (
        <PunchTile
          key={route.id}
          number={route.number}
          state={deriveTileState(logByRoute.get(route.id))}
          zone={logByRoute.get(route.id)?.zone}
        />
      ))}
    </div>
  );
}
