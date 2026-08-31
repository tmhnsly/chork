import { shimmerStyles } from "@/components/ui";
import styles from "./profileHero.module.scss";
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
        <span className={styles.avatarRing}>
          <span className={styles.avatarSlot} />
        </span>
        <div className={styles.names}>
          <span className={styles.username}>@climber</span>
          <span className={styles.meta}>Name</span>
          <ul className={styles.chips}>
            <li className={styles.chip}>#0 this set</li>
            <li className={styles.chip}>Gym</li>
          </ul>
        </div>
        <div className={styles.corner}>
          <span className={actionStyles.iconButton} />
        </div>
      </div>

      <div className={styles.scoreboard} aria-hidden>
        {["Points", "Flashes", "Sends"].map((label) => (
          <div key={label} className={styles.score}>
            <span className={styles.scoreValue}>0</span>
            <span className={styles.scoreLabel}>{label}</span>
          </div>
        ))}
      </div>

      <div className={actionStyles.row} aria-hidden>
        <span className={actionStyles.friendsRow} />
      </div>
    </section>
  );
}
