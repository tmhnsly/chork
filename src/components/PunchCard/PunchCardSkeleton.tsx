import { FaChartBar, FaBolt, FaCalendarDay, FaStar } from "react-icons/fa6";
import { shimmerStyles, BentoGrid, BentoStat } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./punchCard.module.scss";

/**
 * Loading skeleton for the punch card page.
 * Static text renders immediately; only dynamic data shimmers.
 */
export function PunchCardSkeleton() {
  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Punch Card</h2>

      <footer className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.swatchCompleted}`} />
          Completed
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.swatchFlash}`} />
          Flash
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.swatchAttempted}`} />
          Attempted
        </span>
      </footer>

      <div className={styles.tileGrid}>
        {Array.from({ length: 14 }, (_, i) => (
          <PunchTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
        ))}
      </div>

      <BentoGrid columns={2}>
        <BentoStat label="Progress" icon={<FaChartBar />} variant="accent" className={shimmerStyles.skeleton} />
        <BentoStat label="Score" icon={<FaStar />} className={shimmerStyles.skeleton} />
        <BentoStat label="Flash rate" icon={<FaBolt />} variant="flash" className={shimmerStyles.skeleton} />
        <BentoStat label="Reset" icon={<FaCalendarDay />} className={shimmerStyles.skeleton} />
      </BentoGrid>
    </div>
  );
}
