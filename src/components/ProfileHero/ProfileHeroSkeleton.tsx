import { shimmerStyles } from "@/components/ui";
import styles from "./profileHero.module.scss";
// The gear slot borrows the icon-button shape so the corner is the
// same size before the real control arrives.
import actionStyles from "./profileActions.module.scss";

/**
 * Stands in for `ProfileHero` while the profile loads.
 *
 * The hero's height moves with its width — the handle drops a type
 * step on a phone and the chips wrap — so a card-shaped block of one
 * fixed height matched it at one width and shifted the whole page
 * below at every other. This is the hero's own layout with blank
 * content: the same stylesheet, the same washed identity row with a
 * chip line of the same words, three stat tiles, and an action row of
 * the same height, all under one shimmer that melts the placeholders
 * into the pulse. Whatever the width, it measures what the real card
 * measures.
 */
export function ProfileHeroSkeleton() {
  return (
    <section
      className={`${styles.card} ${shimmerStyles.skeleton}`}
      role="status"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <div className={styles.identity} aria-hidden>
        <span className={styles.avatarSlot} />
        <div className={styles.names}>
          <span className={styles.name}>Climber</span>
          <span className={styles.meta}>@climber</span>
        </div>
        <div className={styles.corner}>
          <span className={actionStyles.iconButton} />
        </div>
      </div>

      <div className={styles.stats} aria-hidden>
        {["This set", "Points", "Flashes"].map((label) => (
          <div key={label} className={styles.stat}>
            <span className={styles.statLabel}>{label}</span>
            <span className={styles.statValue}>0</span>
          </div>
        ))}
      </div>
    </section>
  );
}
