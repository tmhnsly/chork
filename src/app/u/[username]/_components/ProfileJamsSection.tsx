import { createServerSupabase } from "@/lib/supabase/server";
import { getUserJams } from "@/lib/data/jam-queries";
import { computeJamLifetimeStats } from "@/lib/data/jam-stats";
import { JamHistoryList } from "@/components/Jam/JamHistoryList";
import { JamLifetimeStatsCard } from "@/components/Jam/JamLifetimeStatsCard";
import styles from "./profileJamsSection.module.scss";

interface Props {
  userId: string;
  isOwnProfile?: boolean;
}

/**
 * Jam history section on a climber's profile. Shows a lifetime stats
 * card (jams played, wins, best finish, totals) followed by the
 * recent-jams list. Visible for both the profile's owner and any
 * visitor — jam history is public within the app. Hidden entirely
 * when the climber has no jams on record (keeps the profile quiet
 * for first-time visitors).
 *
 * The list fetch pulls a higher cap (200) than the wall-side
 * pagination needs, because the same rows feed `computeJamLifetimeStats`
 * which aggregates across the climber's entire jam career. If a power
 * user blows past 200 jams, we'll add a dedicated
 * `get_jam_lifetime_stats` RPC; until then the client-side sum is
 * cheap enough to be a non-issue.
 */
export async function ProfileJamsSection({ userId, isOwnProfile }: Props) {
  const supabase = await createServerSupabase();
  const jams = await getUserJams(supabase, userId, { limit: 200 });

  if (jams.length === 0) return null;

  const stats = computeJamLifetimeStats(jams);
  // Trim to the most-recent 20 for the visible list — the stats card
  // already speaks to the full picture, so the list is a scroll-light
  // preview rather than an exhaustive log.
  const recentJams = jams.slice(0, 20);

  return (
    <section className={styles.section} aria-labelledby="profile-jams-heading">
      <div className={styles.header}>
        <h2 id="profile-jams-heading" className={styles.heading}>
          Jams
        </h2>
        <span className={styles.count}>
          {stats.jamsPlayed} {stats.jamsPlayed === 1 ? "jam" : "jams"}
        </span>
      </div>
      <JamLifetimeStatsCard stats={stats} isOwnProfile={isOwnProfile} />
      <JamHistoryList jams={recentJams} />
    </section>
  );
}
