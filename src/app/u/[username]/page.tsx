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

  const supabase = await createServerSupabase();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  const profileUser = await getProfileByUsername(supabase, username);
  if (!profileUser) notFound();

  const isOwnProfile = authUser?.id === profileUser.id;

  // Get the user's active gym for gym-scoped queries
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

  // All data in one parallel batch
  const [viewStats, activityEvents, miniRoutes, miniLogs] = await Promise.all([
    getUserSetStats(supabase, profileUser.id, gymId),
    isOwnProfile ? getActivityEventsForUser(supabase, profileUser.id, 3) : Promise.resolve([]),
    activeSet ? getRoutesBySet(supabase, activeSet.id) : Promise.resolve([]),
    activeSet ? getLogsBySetForUser(supabase, activeSet.id, profileUser.id) : Promise.resolve([]),
  ]);

  // Build stats
  const useViewStats = viewStats.length > 0;
  const statsBySet = new Map<string, { completions: number; flashes: number; points: number }>();
  let allTimeStats: { completions: number; flashes: number; points: number };

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

  const currentSetStats = activeSet
    ? statsBySet.get(activeSet.id) ?? { completions: 0, flashes: 0, points: 0 }
    : null;

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
