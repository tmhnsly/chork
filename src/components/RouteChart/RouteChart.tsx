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
          const points = log ? computePoints(log) : 0;
          const flash = log ? isFlash(log) : false;
          const attempted = log && log.attempts > 0 && !log.completed;
          const maxForRoute = routeHasZone[i] ? 5 : 4;
          const height = points > 0 ? (points / maxForRoute) * 100 : 0;

          let barClass = styles.bar;
          if (flash) barClass += ` ${styles.barFlash}`;
          else if (log?.completed) barClass += ` ${styles.barCompleted}`;
          else if (attempted) barClass += ` ${styles.barAttempted}`;

          return (
            <div key={routeId} className={styles.column}>
              <div className={styles.barTrack}>
                {height > 0 && (
                  <div className={barClass} style={{ height: `${height}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.dots}>
        {routeIds.map((routeId) => {
          const log = logs.get(routeId);
          return (
            <div
              key={routeId}
              className={`${styles.dot} ${log?.zone ? styles.dotActive : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}
