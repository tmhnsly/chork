import Link from "next/link";
import { FaPlus } from "react-icons/fa6";
import { requireSignedIn } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserMatches } from "@/lib/data/match-queries";
import { ChorkMark, LinkButton } from "@/components/ui";
import { MatchHistoryList } from "@/components/Match/MatchHistoryList";
import { MatchHistoryRowSkeleton } from "@/components/Match/MatchHistoryRowSkeleton";
import { Named } from "@/components/motion";
import styles from "./match.module.scss";

const RECENT_MATCHES_LIMIT = 5;

/** Recent games, streamed. */
export async function RecentGames() {
  const auth = await requireSignedIn();
  if ("error" in auth) return null;
  const recentMatches = await getUserMatches(createServiceClient(), auth.userId, {
    limit: RECENT_MATCHES_LIMIT,
  });

  return (
    <Named name="recent-games" share="reveal" update="tween">
    <div className={styles.history}>
      <section className={styles.historySection} aria-labelledby="recent-games-heading">
        <div className={styles.historyHeader}>
          <h2 id="recent-games-heading" className={styles.historyHeading}>
            Recent games
          </h2>
          {recentMatches.length > 0 && (
            <Link href="/profile" className={styles.historyLink}>
              See all
            </Link>
          )}
        </div>
        {recentMatches.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyMark} aria-hidden>
              <ChorkMark size={56} mode="accent" />
            </div>
            <p className={styles.emptyTitle}>No games yet</p>
            <p className={styles.emptyLede}>
              Start one with your mates or join by code.
            </p>
            <LinkButton href="/match/new">
              <FaPlus aria-hidden /> Start the first one
            </LinkButton>
          </div>
        ) : (
          <MatchHistoryList matches={recentMatches} />
        )}
      </section>
    </div>
    </Named>
  );
}

/** `RecentGames`, waiting: the heading and three rows on the list's stylesheet. */
export function RecentGamesSkeleton() {
  return (
    <Named name="recent-games" share="reveal" update="tween">
      <div className={styles.history} aria-hidden>
        <section className={styles.historySection}>
          <div className={styles.historyHeader}>
            <h2 className={styles.historyHeading}>Recent games</h2>
          </div>
          <MatchHistoryRowSkeleton />
          <MatchHistoryRowSkeleton />
          <MatchHistoryRowSkeleton />
        </section>
      </div>
    </Named>
  );
}
