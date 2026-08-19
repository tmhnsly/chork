"use client";

import styles from "./achievementCard.module.scss";

interface Props {
  /** How many achievements are not on the shelf. */
  count: number;
  onPress: () => void;
}

/**
 * The "+N more" tile at the end of the shelf.
 *
 * Deliberately in `AchievementCard`'s folder and on its stylesheet.
 * It is not an achievement, so it does not go through that component —
 * but it sits in the same row and must match it exactly. When it had
 * its own copy of the shape in `badgeShelf.module.scss` the two
 * drifted the moment the card was extracted: the card centres its
 * contents, the old slot pinned them left at a fixed 4.5rem, so the
 * dashed circle sat higher and narrower than every real badge beside
 * it.
 */
export function MoreAchievementsCard({ count, onPress }: Props) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`${styles.card} ${styles["card--more"]}`}
      aria-label={`See all ${count} more achievements`}
    >
      <span className={`${styles.circle} ${styles.moreCircle}`}>+{count}</span>
      <span className={styles.name}>More</span>
    </button>
  );
}
