import { shimmerStyles } from "@/components/ui";
import styles from "./profileHero.module.scss";
// The gear slot borrows IconButton's shape so the corner is the same
// size before the real control arrives.
import iconButtonStyles from "@/components/ui/iconButton.module.scss";

/**
 * Stands in for `ProfileHero` while the profile loads.
 *
 * The hero's height moves with its width — a long name wraps — so a
 * block of one fixed height matched it at one width and shifted the
 * whole page below at every other. This is the hero's own layout with
 * blank content: the same stylesheet, the same centred avatar, a name,
 * a meta line and a career line of the same words, all under one
 * shimmer that melts the placeholders into the pulse. Whatever the
 * width, it measures what the real hero measures.
 */
export function ProfileHeroSkeleton() {
  return (
    <section
      className={`${styles.hero} ${shimmerStyles.skeleton}`}
      role="status"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <div className={styles.corner} aria-hidden>
        <span className={iconButtonStyles.root} />
      </div>
      <span className={styles.avatarSlot} aria-hidden />
      <div className={styles.names} aria-hidden>
        <span className={styles.name}>Climber</span>
        <span className={styles.meta}>@climber</span>
        <span className={styles.career}>
          {["0 sends", "0 flashes", "0 sets"].map((label) => (
            <span key={label} className={styles.careerItem}>
              {label}
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}
