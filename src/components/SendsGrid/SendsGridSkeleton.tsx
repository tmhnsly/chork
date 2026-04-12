import { shimmerStyles, Legend } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import styles from "./sendsGrid.module.scss";
import skeletonStyles from "./sendsGridSkeleton.module.scss";

/**
 * Loading skeleton for the wall page. Mirrors the real layout precisely:
 * title → StatsWidget (ring row + route chart + footer) → Legend → grid.
 * Static text renders immediately; only dynamic data shimmers.
 */
export function SendsGridSkeleton() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading wall">
      <h2 className={styles.title}>The Wall</h2>

      {/* Stats widget — matches StatsWidget's internal structure */}
      <div className={skeletonStyles.statsCard}>
        <div className={skeletonStyles.ringRow}>
          <div className={`${skeletonStyles.ring} ${shimmerStyles.skeleton}`} />
          <div className={skeletonStyles.statsStack}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={skeletonStyles.stat}>
                <div className={`${skeletonStyles.statValue} ${shimmerStyles.skeleton}`} />
                <div className={`${skeletonStyles.statLabel} ${shimmerStyles.skeleton}`} />
              </div>
            ))}
          </div>
        </div>
        <div className={`${skeletonStyles.chartPlaceholder} ${shimmerStyles.skeleton}`} />
        <div className={`${skeletonStyles.footerLine} ${shimmerStyles.skeleton}`} />
      </div>

      <Legend />

      <div className={styles.tileGrid}>
        {Array.from({ length: 14 }, (_, i) => (
          <PunchTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
        ))}
      </div>
    </div>
  );
}
