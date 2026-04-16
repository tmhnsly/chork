import { CardSkeleton, shimmerStyles } from "@/components/ui";
import { PROFILE_SECTION_HEIGHTS } from "./_components/sectionHeights";
import styles from "./loading.module.scss";

/**
 * Profile skeleton. Each section collapses to a single card-shaped
 * block instead of reconstructing the inner layout of the real card.
 * Fewer moving parts means less visible "pop" when real data hydrates.
 *
 * Header is the one place where we DO mirror the real layout exactly
 * (avatar 72px on the left, identity stack on the right, meta row
 * reserved to the touch-target minimum height) — any divergence
 * causes a vertical reflow on stream-in, which iOS users see as the
 * bottom nav briefly jumping up then dropping back into place.
 */
export default function ProfileLoading() {
  return (
    <main className={styles.page} role="status" aria-busy="true" aria-label="Loading profile">
      <header className={styles.header}>
        <div className={`${styles.avatar} ${shimmerStyles.skeleton}`} />
        <div className={styles.identity}>
          <div className={`${styles.lineUsername} ${shimmerStyles.skeleton}`} />
          <div className={styles.metaRow}>
            <div className={`${styles.lineName} ${shimmerStyles.skeleton}`} />
          </div>
        </div>
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
