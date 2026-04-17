import { FaLayerGroup } from "react-icons/fa6";
import { shimmerStyles, Legend } from "@/components/ui";
import { SectionCard } from "@/components/ui/SectionCard";
import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import { SendGridTile } from "@/components/SendGridTile/SendGridTile";
import styles from "./sendsGrid.module.scss";

const PLACEHOLDER_COUNT = 14;

// Stable synthetic identifiers for the empty RouteChart — same count
// as the tile grid so the bar density matches the real layout.
const EMPTY_ROUTE_IDS = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => `skeleton-${i}`);
const EMPTY_ROUTE_HAS_ZONE = Array.from({ length: PLACEHOLDER_COUNT }, () => false);
const EMPTY_ROUTE_NUMBERS = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => i + 1);
const EMPTY_LOGS = new Map();

/**
 * Loading skeleton for the wall page.
 *
 * Stats widget: one big shimmer over the whole `SectionCard`. The
 * card renders its real shell + real (zero-data) RingStatsRow and
 * RouteChart so its height is byte-identical to the hydrated widget —
 * no layout jump. Applying `.skeleton` directly to the card replaces
 * its bg with the shimmer gradient and forces `color: transparent`
 * on every text/icon inside, hiding the placeholder numbers beneath
 * a single seamless shimmer surface.
 *
 * Tile grid: real `SendGridTile` placeholders each get a shimmer class
 * for the same height-matching reason.
 */
export function SendsGridSkeleton() {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="Loading wall">
      <SectionCard
        title="Current Set"
        icon={<FaLayerGroup />}
        className={shimmerStyles.skeleton}
      >
        <RingStatsRow
          completions={0}
          flashes={0}
          zones={0}
          points={0}
          totalRoutes={PLACEHOLDER_COUNT}
          zoneCompletions={0}
          size={72}
        />
        <RouteChart
          logs={EMPTY_LOGS}
          routeIds={EMPTY_ROUTE_IDS}
          routeHasZone={EMPTY_ROUTE_HAS_ZONE}
          routeNumbers={EMPTY_ROUTE_NUMBERS}
        />
      </SectionCard>

      <Legend />

      <div className={styles.tileGrid}>
        {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
          <SendGridTile key={i} number={i + 1} state="empty" className={shimmerStyles.skeleton} />
        ))}
      </div>
    </div>
  );
}
