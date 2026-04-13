import { CardSkeleton, shimmerStyles, Legend } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./sendsGrid.module.scss";

const PLACEHOLDER_COUNT = 14;

/**
 * Loading skeleton for the wall page. One card-shaped block stands in
 * for the whole Current Set widget (rings + route chart) and the tile
 * grid pre-renders real `PunchTile` placeholders so its dimensions
 * match the real layout exactly — fewer moving pieces, less visible
 * pop as data arrives.
 */
export function SendsGridSkeleton() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading wall">
      <CardSkeleton height="18rem" ariaLabel="Loading current set" />

      <Legend />

      <div className={styles.tileGrid}>
        {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
          <PunchTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
        ))}
      </div>
    </div>
  );
}
