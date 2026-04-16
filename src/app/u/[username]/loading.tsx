import { CardSkeleton, shimmerStyles } from "@/components/ui";
import { PROFILE_SECTION_HEIGHTS } from "./_components/sectionHeights";
import styles from "./loading.module.scss";

/**
 * Profile skeleton. Each section collapses to a single card-shaped
 * block instead of reconstructing the inner layout of the real card.
 * Fewer moving parts means less visible "pop" when real data hydrates.
 * Card heights target the tallest expected state so the surrounding
 * layout stays put.
 */
export default function ProfileLoading() {
  return (
    <main className={styles.page} role="status" aria-busy="true" aria-label="Loading profile">
      {/* Profile header — not a card, but matches the real header's
          row layout + min-height so the skeleton doesn't ride up. */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={`${styles.lineUsername} ${shimmerStyles.skeleton}`} />
          <div className={`${styles.lineName} ${shimmerStyles.skeleton}`} />
        </div>
        <div className={`${styles.avatar} ${shimmerStyles.skeleton}`} />
      </header>

      <CardSkeleton
        height={PROFILE_SECTION_HEIGHTS.allTime}
        ariaLabel="Loading all-time stats"
      />
      <CardSkeleton
        height={PROFILE_SECTION_HEIGHTS.currentSet}
        ariaLabel="Loading current set"
      />
      <CardSkeleton
        height={PROFILE_SECTION_HEIGHTS.achievements}
        ariaLabel="Loading achievements"
      />
      <CardSkeleton
        height={PROFILE_SECTION_HEIGHTS.previousSets}
        ariaLabel="Loading sets"
      />
    </main>
  );
}
