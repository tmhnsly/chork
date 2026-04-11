import { shimmerStyles, Legend } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./sendGrid.module.scss";
import skeletonStyles from "./sendGridSkeleton.module.scss";

/**
 * Loading skeleton for the wall page.
 * Static text renders immediately; only dynamic data shimmers.
 */
export function SendGridSkeleton() {
  return (
    <div className={styles.page}>
      <h2 className={styles.title}>The Wall</h2>

      <div className={`${skeletonStyles.statsBlock} ${shimmerStyles.skeleton}`} />

      <Legend />

      <div className={styles.tileGrid}>
        {Array.from({ length: 14 }, (_, i) => (
          <PunchTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
        ))}
      </div>
    </div>
  );
}
