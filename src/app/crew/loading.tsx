import { CardSkeleton, shimmerStyles } from "@/components/ui";
import styles from "./crew.module.scss";
import loadingStyles from "./loading.module.scss";

/**
 * Route-level loading boundary for /crew. Collapsed to card-shaped
 * blocks per section so the layout stays stable when the real feed /
 * leaderboard resolve — no staggered item-by-item pop-in.
 */
export default function CrewLoading() {
  return (
    <main className={styles.page} role="status" aria-busy="true" aria-label="Loading crew">
      <header className={styles.header}>
        <div className={`${loadingStyles.title} ${shimmerStyles.skeleton}`} />
        <div className={`${loadingStyles.sub} ${shimmerStyles.skeleton}`} />
      </header>

      <CardSkeleton height="12rem" ariaLabel="Loading activity feed" />
      <CardSkeleton height="16rem" ariaLabel="Loading leaderboard" />
    </main>
  );
}
