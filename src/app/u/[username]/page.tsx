import { notFound } from "next/navigation";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { FaBolt } from "react-icons/fa6";
import { createServerPBFromCookies } from "@/lib/pocketbase-server";
import { getAuthUser } from "@/lib/pocketbase";
import {
  getUserByUsername,
  getAllSets,
  getAllLogsForUser,
  getActivityEventsForUser,
} from "@/lib/data/sets";
import { isFlash, computePoints } from "@/lib/data";
import type { RouteLogWithSetId } from "@/lib/data";
import { ProfileHeader } from "@/components/ProfileHeader/ProfileHeader";
import { ClimberStats } from "@/components/ClimberStats/ClimberStats";
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

  // All data in two parallel batches — no waterfall
  const [pb, profileUser, allSets] = await Promise.all([
    createServerPBFromCookies(),
    getUserByUsername(username),
    getAllSets(),
  ]);

  if (!profileUser) notFound();

  const currentUser = getAuthUser(pb);
  const isOwnProfile = currentUser?.id === profileUser.id;

  // Second parallel batch: all logs (with route expanded) + activity
  const [allLogs, activityEvents] = await Promise.all([
    getAllLogsForUser(profileUser.id),
    isOwnProfile ? getActivityEventsForUser(profileUser.id, 10) : Promise.resolve([]),
  ]);

  // Group logs by set_id using the expanded route_id
  const logsBySet = new Map<string, RouteLogWithSetId[]>();
  for (const log of allLogs) {
    const setId = log.expand?.route_id?.set_id;
    if (!setId) continue;
    const arr = logsBySet.get(setId);
    if (arr) arr.push(log);
    else logsBySet.set(setId, [log]);
  }

  // Current set stats
  const activeSet = allSets.find((s) => s.active) ?? null;
  const currentSetStats = activeSet
    ? (() => {
        const logs = logsBySet.get(activeSet.id) ?? [];
        const stats = deriveStats(logs);
        return {
          label: formatSetLabel(activeSet.starts_at, activeSet.ends_at),
          ...stats,
        };
      })()
    : null;

  // All-time stats
  const allTimeStats = deriveStats(allLogs);

  // Previous sets (inactive, with completions, most recent first)
  const previousSets = allSets
    .filter((s) => !s.active)
    .map((set) => {
      const logs = logsBySet.get(set.id) ?? [];
      const stats = deriveStats(logs);
      if (stats.completions === 0) return null;
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
      />

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

              const timeAgo = formatDistanceToNow(parseISO(event.created), {
                addSuffix: true,
              });

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
