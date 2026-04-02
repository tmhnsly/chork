import { FaChartBar, FaBolt, FaCalendarDay, FaStar } from "react-icons/fa6";
import { Shimmer, BentoGrid, BentoStat } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./punchCard.module.scss";

/**
 * Loading skeleton for the punch card page.
 * Each section is wrapped individually so users see the page
 * structure with per-section shimmer effects.
 */
export function PunchCardSkeleton() {
  return (
    <div className={styles.page}>
      <Shimmer>
        <h2 className={styles.title}>Punch Card</h2>
      </Shimmer>

      <Shimmer>
        <footer className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} />
            Completed
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} />
            Flash
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatch} />
            Attempted
          </span>
        </footer>
      </Shimmer>

      <div className={styles.tileGrid}>
        {Array.from({ length: 12 }, (_, i) => (
          <Shimmer key={i}>
            <PunchTile number={i + 1} state="empty" />
          </Shimmer>
        ))}
      </div>

      <BentoGrid columns={2}>
        <Shimmer><BentoStat label="Progress" value="0/0" icon={<FaChartBar />} variant="accent" /></Shimmer>
        <Shimmer><BentoStat label="Score" value={0} icon={<FaStar />} /></Shimmer>
        <Shimmer><BentoStat label="Flash rate" value="0%" icon={<FaBolt />} variant="flash" /></Shimmer>
        <Shimmer><BentoStat label="Reset" value="---" icon={<FaCalendarDay />} /></Shimmer>
      </BentoGrid>
    </div>
  );
}
