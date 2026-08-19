import { shimmerStyles } from "@/components/ui";
import styles from "./profileHero.module.scss";
import actionStyles from "./profileActions.module.scss";

/**
 * Stands in for `ProfileHero` while the profile loads.
 *
 * The hero's height moves with its width — the handle drops a type
 * step on a phone and the ratio line wraps to two — so a card-shaped
 * block of one fixed height matched it at one width and shifted the
 * whole page below at every other. This is the hero's own layout with
 * blank content: the same stylesheet, the same identity row, three
 * stat tiles, a ratio line of the same words, and an action row of
 * the same height, all under one shimmer that melts the placeholders
 * into the pulse. Whatever the width, it measures what the real card
 * measures.
 *
 * The placeholder text is real-length text on purpose — the ratio
 * pairs wrap at the same point as the real ones because they are the
 * same width — and every character is transparent under `.skeleton`.
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
          <span className={styles.username}>@climber</span>
          <span className={styles.meta}>Name · Gym</span>
        </div>
      </div>

      <div className={styles.headline} aria-hidden>
        {["Points", "Sends", "Flashes"].map((label) => (
          <div key={label} className={styles.stat}>
            <span className={styles.value}>0</span>
            <span className={styles.label}>{label}</span>
          </div>
        ))}
      </div>

      <p className={styles.ratios} aria-hidden>
        <span className={styles.pair}>
          <span>00% flashed</span>
          <span>0.0 pts / send</span>
        </span>
        <span className={styles.pair}>
          <span>00% completion</span>
          <span>0 set streak</span>
        </span>
      </p>

      <div className={actionStyles.row} aria-hidden>
        <span className={actionStyles.friendsRow} />
        <span className={actionStyles.iconButton} />
      </div>
    </section>
  );
}
