import type { RouteLog } from "@/lib/data";
import { computePoints, isFlash } from "@/lib/data";
import styles from "./routeChart.module.scss";

interface Props {
  logs: Map<string, RouteLog>;
  routeIds: string[];
  /** Whether each route has a zone hold — used to compute per-route max points */
  routeHasZone: boolean[];
}

/**
 * Mini bar chart — points per route. Each bar fills relative to that route's
 * max possible score (4 for non-zone, 5 for zone routes).
 * Below: zone indicator dots.
 */
export function RouteChart({ logs, routeIds, routeHasZone }: Props) {
  return (
    <div className={styles.chart}>
      <div className={styles.bars}>
        {routeIds.map((routeId, i) => {
          const log = logs.get(routeId);
          const completed = log?.completed ?? false;
          const attempted = !!(log && log.attempts > 0 && !completed);
          const flash = log ? isFlash(log) : false;

          const state = flash
            ? "flash"
            : completed
              ? "completed"
              : attempted
                ? "attempted"
                : "empty";

          const maxForRoute = routeHasZone[i] ? 5 : 4;
          const height =
            completed ? (computePoints(log!) / maxForRoute) * 100
            : attempted ? 15
            : 0;

          // Always render the bar element so React reuses the same node across
          // state changes — otherwise `height`/`background-color` transitions
          // can't fire when a route flips from empty/attempted to completed.
          return (
            <div key={routeId} className={styles.column}>
              <div className={styles.barTrack}>
                <div
                  className={styles.bar}
                  data-state={state}
                  style={{ "--bar-h": `${height}%`, "--i": i } as React.CSSProperties}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.dots}>
        {routeIds.map((routeId, i) => {
          const hasZone = routeHasZone[i];
          const claimed = logs.get(routeId)?.zone ?? false;
          const cls = [
            styles.dot,
            hasZone ? styles.dotZone : "",
            claimed ? styles.dotClaimed : "",
          ].filter(Boolean).join(" ");
          return <div key={routeId} className={cls} />;
        })}
      </div>
    </div>
  );
}
