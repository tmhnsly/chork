import { FaLayerGroup } from "react-icons/fa6";
import { shimmerStyles } from "@/components/ui";
import { SectionCard } from "@/components/ui/SectionCard";
import { RingStatsRow } from "@/components/ui/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/ui/RouteChart/RouteChart";

const PLACEHOLDER_COUNT = 14;

// Stable synthetic identifiers for the empty RouteChart — enough bars
// that the chart's density reads like a real set.
const EMPTY_ROUTE_IDS = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => `skeleton-${i}`);
const EMPTY_ROUTE_HAS_ZONE = Array.from({ length: PLACEHOLDER_COUNT }, () => false);
const EMPTY_ROUTE_NUMBERS = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => i + 1);
const EMPTY_LOGS = new Map();

/**
 * Stands in for `StatsWidget` — the "Current Set" card — wherever it
 * loads: the wall and the profile.
 *
 * One big shimmer over the real shell. The card renders its actual
 * header, a zero-data `RingStatsRow` and an empty `RouteChart`, so its
 * height is the hydrated widget's height at EVERY width — including
 * the phone widths where the ring gives up some size to fit beside
 * the stats. A card-shaped block of a fixed rem height cannot follow
 * that; this does, for free, because it is the same layout.
 *
 * Applying `.skeleton` to the card swaps its background for the
 * shimmer gradient and forces `color: transparent` on everything
 * inside, so the placeholder zeros never show through.
 */
export function StatsWidgetSkeleton() {
  return (
    <SectionCard
      title="Current Set"
      icon={<FaLayerGroup />}
      className={shimmerStyles.skeleton}
    >
      {/* Two-digit points and a two-digit ceiling, not zeros: the
          numbers are transparent, but their WIDTH decides how much
          room the ring has on a phone, and so how tall the row is.
          A skeleton reading "0 PTS" left the ring 8px more than the
          real "14 /61 PTS" does, and the card shrank on hand-off. */}
      <RingStatsRow
        completions={0}
        flashes={0}
        zones={0}
        points={PLACEHOLDER_COUNT}
        maxPoints={PLACEHOLDER_COUNT * 4}
        totalRoutes={PLACEHOLDER_COUNT}
        zoneCompletions={0}
      />
      <RouteChart
        logs={EMPTY_LOGS}
        routeIds={EMPTY_ROUTE_IDS}
        routeHasZone={EMPTY_ROUTE_HAS_ZONE}
        routeNumbers={EMPTY_ROUTE_NUMBERS}
      />
    </SectionCard>
  );
}
