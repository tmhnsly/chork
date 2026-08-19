import { CardSkeleton } from "@/components/ui";
import { PROFILE_SECTION_HEIGHTS } from "./_components/sectionHeights";
import styles from "./loading.module.scss";

/**
 * Profile skeleton. Each section collapses to a single card-shaped
 * block instead of reconstructing the inner layout of the real card.
 * Fewer moving parts means less visible "pop" when real data hydrates.
 *
 * The top block is ONE card, because the top of the page is one card
 * now — the hero fused the old header and the all-time stats. This
 * used to mirror the header's avatar + identity stack in detail and
 * then draw a second card underneath; both of those described a page
 * that no longer exists.
 */
export default function ProfileLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading profile">
      <CardSkeleton height={PROFILE_SECTION_HEIGHTS.hero} ariaLabel="Loading profile" />
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
