import { shimmerStyles, Legend } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import styles from "./sendsGrid.module.scss";
import skeletonStyles from "./sendsGridSkeleton.module.scss";

const PLACEHOLDER_COUNT = 14;

// Stable synthetic route IDs — used so <RouteChart> renders the right
// number of empty bars without touching any real data. The chart keys
// off these, so we need the same count as tiles for visual parity.
const EMPTY_ROUTE_IDS = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => `skeleton-${i}`);
const EMPTY_ROUTE_ZONES = Array.from({ length: PLACEHOLDER_COUNT }, () => false);
const EMPTY_LOGS = new Map();

/**
 * Loading skeleton for the wall page. Composes the real StatsWidget
 * sub-components (RingStatsRow, RouteChart) with zero-data so every
 * dimension is coupled to the real UI by construction — no magic
 * numbers, no risk of drift between skeleton and rendered widget.
 */
export function SendsGridSkeleton() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading wall">
      <h2 className={styles.title}>The Wall</h2>

      <div className={skeletonStyles.statsCard}>
        {/* Real RingStatsRow with zero counts — identical dimensions to the
            widget that will replace this block. The values shimmer under an
            overlay rather than us approximating the layout. */}
        <div className={shimmerStyles.skeleton}>
          <RingStatsRow completions={0} flashes={0} points={0} totalRoutes={0} maxPoints={0} size={72} />
        </div>
        <div className={shimmerStyles.skeleton}>
          <RouteChart logs={EMPTY_LOGS} routeIds={EMPTY_ROUTE_IDS} routeHasZone={EMPTY_ROUTE_ZONES} />
        </div>
        <div className={`${skeletonStyles.footerLine} ${shimmerStyles.skeleton}`} />
      </div>

      <Legend />

      <div className={styles.tileGrid}>
        {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
          <PunchTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
        ))}
      </div>
    </div>
  );
}
