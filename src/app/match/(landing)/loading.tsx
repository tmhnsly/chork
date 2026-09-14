import { PageHeaderSkeleton } from "@/components/ui";
import { MatchHistoryRowSkeleton } from "@/components/Match/MatchHistoryRowSkeleton";
import { NextGameCard } from "./NextGameCard";
import styles from "./match.module.scss";

/**
 * Skeleton for /match: the header (no subtitle), the Start / Join
 * card — static, so it IS the real component — and three rows where
 * recent games go, on the list's own stylesheet.
 */
export default function MatchLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading games">
      <PageHeaderSkeleton />
      <NextGameCard />
      <section className={styles.historySection} aria-hidden>
        <div className={styles.historyHeader}>
          <h2 className={styles.historyHeading}>Recent games</h2>
        </div>
        <MatchHistoryRowSkeleton />
        <MatchHistoryRowSkeleton />
        <MatchHistoryRowSkeleton />
      </section>
    </main>
  );
}
