import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import type { RouteLog } from "@/lib/data";
import { computeMaxPoints } from "@/lib/data";
import styles from "./statsWidget.module.scss";

interface Props {
  completions: number;
  total: number;
  flashes: number;
  points: number;
  logs: Map<string, RouteLog>;
  routeIds: string[];
  routeHasZone: boolean[];
  resetDate?: string;
}

export function StatsWidget({
  completions,
  total,
  flashes,
  points,
  logs,
  routeIds,
  routeHasZone,
  resetDate,
}: Props) {
  const zoneRouteCount = routeHasZone.filter(Boolean).length;
  const maxPoints = computeMaxPoints(total, zoneRouteCount);

  return (
    <div className={styles.widget}>
      <RingStatsRow
        completions={completions}
        flashes={flashes}
        points={points}
        totalRoutes={total}
        maxPoints={maxPoints}
        size={72}
      />

      <div className={styles.chartBlock}>
        <RouteChart
          logs={logs}
          routeIds={routeIds}
          routeHasZone={routeHasZone}
        />
      </div>

      <div className={styles.footerRow}>
        <span className={styles.footerLabel}>ZONES</span>
        {resetDate && (
          <span className={styles.footerLabel}>RESETS {resetDate.toUpperCase()}</span>
        )}
      </div>
    </div>
  );
}
