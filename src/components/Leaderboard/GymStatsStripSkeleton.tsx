import { FaChartColumn } from "react-icons/fa6";
import { shimmerStyles } from "@/components/ui";
import { SectionCard } from "@/components/ui/SectionCard";
import styles from "./gymStatsStrip.module.scss";

/**
 * `GymStatsStrip`, waiting: the same card, the same four cells from
 * the same stylesheet, with a bar where each number goes. Sharing the
 * stylesheet is the point — a change to the strip's layout reaches
 * its skeleton without anyone remembering to.
 */
export function GymStatsStripSkeleton() {
  return (
    <SectionCard
      title="Gym stats"
      icon={<FaChartColumn />}
      meta={<span className={shimmerStyles.skeletonLine} style={{ "--skeleton-w": "8rem" } as React.CSSProperties} />}
    >
      <div className={styles.strip} aria-hidden>
        {["Climbers", "Sends", "Flashes", "Routes"].map((label) => (
          <div key={label} className={styles.cell}>
            <span className={`${styles.value} ${shimmerStyles.skeletonLine}`} style={{ "--skeleton-w": "2.5rem" } as React.CSSProperties} />
            <span className={styles.label}>{label}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
