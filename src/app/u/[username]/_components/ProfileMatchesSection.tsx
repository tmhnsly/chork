import { createServiceClient } from "@/lib/supabase/server";
import { getUserMatches } from "@/lib/data/match-queries";
import { computeMatchLifetimeStats } from "@/lib/data/match-stats";
import { MatchHistoryList } from "@/components/Match/MatchHistoryList";
import { MatchLifetimeStatsCard } from "@/components/Match/MatchLifetimeStatsCard";
import styles from "./profileMatchesSection.module.scss";

/**
 * Upper bound on how many match rows we fetch for lifetime-stat
 * aggregation. The current `getUserMatches` RPC paginates by
 * `started_at desc`, so a power user with >200 matches gets their
 * stats computed over their 200 most-recent matches only — `matchesPlayed`
 * undercounts, `bestFinish` could miss an old podium, totals are
 * truncated. Trade-off: server-side aggregation requires a dedicated
 * RPC, and 200 covers every real user today.
 *
 * Follow-up seam if this becomes a real undercount: add
 * `get_match_lifetime_stats(p_user_id uuid)` that aggregates server-side
 * + return alongside the paginated history list.
 */
const MAX_MATCHES_FETCH = 200;

interface Props {
  userId: string;
  isOwnProfile?: boolean;
}

/**
 * Match history section on a climber's profile. Shows a lifetime stats
 * card (matches played, wins, best finish, totals) followed by the
 * recent-matches list. Visible for both the profile's owner and any
 * visitor — match history is public within the app. Hidden entirely
 * when the climber has no matches on record (keeps the profile quiet
 * for first-time visitors).
 *
 * The list fetch pulls a higher cap (200) than the wall-side
 * pagination needs, because the same rows feed `computeMatchLifetimeStats`
 * which aggregates across the climber's entire match career. If a power
 * user blows past 200 matches, we'll add a dedicated
 * `get_match_lifetime_stats` RPC; until then the client-side sum is
 * cheap enough to be a non-issue.
 */
export async function ProfileMatchesSection({ userId, isOwnProfile }: Props) {
  // Service-role: `get_match_history` takes its subject explicitly and
  // is revoked from `authenticated`, because a profile shows someone
  // ELSE's history — there is no `auth.uid()` answer to "whose". The
  // page has already resolved which profile is being viewed.
  const service = createServiceClient();
  const matches = await getUserMatches(service, userId, { limit: MAX_MATCHES_FETCH });

  if (matches.length === 0) return null;

  const stats = computeMatchLifetimeStats(matches);
  // Trim to the most-recent 20 for the visible list — the stats card
  // already speaks to the full picture, so the list is a scroll-light
  // preview rather than an exhaustive log.
  const recentMatches = matches.slice(0, 20);

  return (
    <section className={styles.section} aria-labelledby="profile-matches-heading">
      <div className={styles.header}>
        <h2 id="profile-matches-heading" className={styles.heading}>
          Matches
        </h2>
        <span className={styles.count}>
          {stats.matchesPlayed} {stats.matchesPlayed === 1 ? "match" : "matches"}
        </span>
      </div>
      <MatchLifetimeStatsCard stats={stats} isOwnProfile={isOwnProfile} />
      <MatchHistoryList matches={recentMatches} />
    </section>
  );
}
