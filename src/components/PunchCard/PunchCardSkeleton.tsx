import { FaChartBar, FaBolt, FaCalendarDay, FaStar } from "react-icons/fa6";
import { Shimmer, BentoGrid, BentoStat } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./punchCard.module.scss";

/**
 * Loading skeleton for the punch card page.
 * Renders the real component markup inside a single Shimmer wrapper
 * so the layout is pixel-identical to the loaded state.
 */
export function PunchCardSkeleton() {
  return (
    <Shimmer>
      <div className={styles.page}>
        <h2 className={styles.title}>Punch Card</h2>

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

        <div className={styles.tileGrid}>
          {Array.from({ length: 12 }, (_, i) => (
            <PunchTile key={i} number={i + 1} state="empty" />
          ))}
        </div>

        <BentoGrid columns={2}>
          <BentoStat label="Progress" value="0/0" icon={<FaChartBar />} variant="accent" />
          <BentoStat label="Score" value={0} icon={<FaStar />} />
          <BentoStat label="Flash rate" value="0%" icon={<FaBolt />} variant="flash" />
          <BentoStat label="Reset" value="---" icon={<FaCalendarDay />} />
        </BentoGrid>
      </div>
    </Shimmer>
  );
}
