import { FaMedal } from "react-icons/fa6";
import { shimmerStyles } from "@/components/ui";
import { SectionCard } from "@/components/ui/SectionCard";
import { SHELF_SLOTS } from "@/lib/achievements/shelf";
import styles from "./badgeShelf.module.scss";

/**
 * Stands in for `BadgeShelf` while achievements load.
 *
 * The real shelf is six slots that sit six-across on a wide card and
 * three-by-two on a phone, so its height depends on the width it
 * lands in — a card-shaped block of one fixed height matched it on a
 * tablet and was ~8rem short on a phone, and the page below jumped on
 * hand-off. This renders the shelf's own grid with blank slots (a
 * circle and a two-line label's worth of space, which is what a real
 * row measures) inside the same shell, under one shimmer, so it
 * follows the same container query and lands at the same height
 * everywhere.
 */
export function BadgeShelfSkeleton() {
  return (
    <SectionCard
      title="Achievements"
      icon={<FaMedal />}
      className={shimmerStyles.skeleton}
      meta={<span className={styles.count} aria-hidden>0<small>/0</small></span>}
    >
      <ul className={styles.row} aria-hidden>
        {Array.from({ length: SHELF_SLOTS + 1 }, (_, i) => (
          <li key={i}>
            <span className={styles.slot}>
              <span className={styles.slotCircle} />
              <span className={styles.slotLabel} />
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
