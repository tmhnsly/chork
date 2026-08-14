import { CardSkeleton, shimmerStyles } from "@/components/ui";
import styles from "./crew.module.scss";
import loadingStyles from "./loading.module.scss";

/**
 * Route-level loading boundary for /crew — the crew PICKER
 * (avatar-stack cards, pending invites, zero-state hero).
 *
 * It previously rendered "Loading activity feed" + "Loading
 * leaderboard", which is the shape of `/crew/[id]`, the detail view.
 * That route now has its own boundary; this one matches the page it
 * actually covers.
 */
export default function CrewLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading crew">
      <header className={styles.header}>
        <div className={`${loadingStyles.title} ${shimmerStyles.skeleton}`} />
        <div className={`${loadingStyles.sub} ${shimmerStyles.skeleton}`} />
      </header>

      {/* Crew cards — the picker's main content. */}
      <CardSkeleton height="7rem" ariaLabel="Loading your crews" />
      <CardSkeleton height="7rem" />
    </main>
  );
}
