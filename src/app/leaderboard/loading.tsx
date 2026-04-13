import { CardSkeleton, shimmerStyles } from "@/components/ui";
import styles from "./loading.module.scss";

/**
 * Skeleton for /leaderboard. Each section collapses to a single card-
 * shaped block — less visible pop when the server data arrives, and
 * anything that isn't literally a card in the real layout (segment,
 * podium) still reads as one while loading.
 */
export default function LeaderboardLoading() {
  return (
    <main className={styles.page} role="status" aria-busy="true" aria-label="Loading Chorkboard">
      <header className={styles.header}>
        <div className={`${styles.title} ${shimmerStyles.skeleton}`} />
      </header>

      <CardSkeleton height="7rem" ariaLabel="Loading gym stats" />
      <CardSkeleton height="3rem" ariaLabel="Loading filter" />
      <CardSkeleton height="14rem" ariaLabel="Loading podium" />
      <CardSkeleton height="8rem" ariaLabel="Loading standings" />
      <CardSkeleton height="10rem" ariaLabel="Loading scoring breakdown" />
      <CardSkeleton height="8rem" ariaLabel="Loading invite card" />
    </main>
  );
}
