import { shimmerStyles } from "@/components/ui";
import styles from "./profileHero.module.scss";
// The gear slot borrows IconButton's shape so the corner is the same
// size before the real control arrives.
import iconButtonStyles from "@/components/ui/iconButton.module.scss";

/**
 * Stands in for `ProfileHero` while the profile loads.
 *
 * The hero is bare on the page — a face, a name, two quiet lines —
 * so its skeleton is bare too: a disc where the face goes and three
 * bars where the words go, in the hero's own layout so it measures
 * what the real hero measures at every width. It must NOT wear the
 * card skeleton: that painted a white block where no card will be.
 */
export function ProfileHeroSkeleton() {
  return (
    <section
      className={styles.hero}
      role="status"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <div className={styles.corner} aria-hidden>
        <span className={iconButtonStyles.root} />
      </div>
      <span className={`${styles.avatarSlot} ${shimmerStyles.skeletonDisc}`} aria-hidden />
      <div className={`${styles.names} ${styles.namesLoading}`} aria-hidden>
        <span className={`${shimmerStyles.skeletonLine} ${styles.nameSlot}`} />
        <span className={`${shimmerStyles.skeletonLine} ${styles.metaSlot}`} />
        <span className={`${shimmerStyles.skeletonLine} ${styles.careerSlot}`} />
      </div>
    </section>
  );
}
