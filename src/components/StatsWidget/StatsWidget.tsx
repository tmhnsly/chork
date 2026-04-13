import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import { SectionCard } from "@/components/ui/SectionCard";
import { SetMeta } from "@/components/ui";
import { computeMaxPoints } from "@/lib/data";
import type { RouteLog } from "@/lib/data";
import styles from "./statsWidget.module.scss";

interface Props {
  completions: number;
  total: number;
  flashes: number;
  points: number;
  logs: Map<string, RouteLog>;
  routeIds: string[];
  routeHasZone: boolean[];
  /** Route numbers for the chart axis (same order/length as routeIds). */
  routeNumbers?: number[];
  resetDate?: string;
  gymName?: string | null;
  /** Leaderboard placement for the viewed climber in this set (optional). */
  rank?: number | null;
}

export function StatsWidget({
  completions,
  total,
  flashes,
  points,
  logs,
  routeIds,
  routeHasZone,
  routeNumbers,
  resetDate,
  gymName,
  rank,
}: Props) {
  // Zones hit is independent of completion — a climber who gets the
  // zone hold without topping out still scores +1 and should see it
  // on the card. `zoneCompletions` is the ring denominator ("routes
  // you've completed that have a zone"), so *that* still gates on
  // `completed`.
  let zones = 0;
  let zoneCompletions = 0;
  routeIds.forEach((id, i) => {
    const log = logs.get(id);
    if (!log) return;
    if (log.zone) zones += 1;
    if (log.completed && routeHasZone[i]) zoneCompletions += 1;
  });
  const zoneRouteCount = routeHasZone.filter(Boolean).length;
  const maxPoints = total > 0 ? computeMaxPoints(total, zoneRouteCount) : undefined;

  // Rank text as the card's icon slot — replaces the old layer-group
  // glyph. Using the climber's placement in the active set as the
  // header mark is more informative *and* lets us remove the
  // duplicate rank cell inside the RingStatsRow totals block.
  const rankIcon =
    rank != null ? (
      <span className={styles.rankIcon}>#{rank}</span>
    ) : null;

  return (
    <SectionCard
      title="Current Set"
      icon={rankIcon}
      meta={<SetMeta resetDate={resetDate} gymName={gymName} />}
    >
      <RingStatsRow
        completions={completions}
        flashes={flashes}
        zones={zones}
        points={points}
        totalRoutes={total}
        zoneCompletions={zoneCompletions}
        maxPoints={maxPoints}
        size={72}
      />

      <div className={styles.chartBlock}>
        <RouteChart
          logs={logs}
          routeIds={routeIds}
          routeHasZone={routeHasZone}
          routeNumbers={routeNumbers}
        />
      </div>
    </SectionCard>
  );
}
