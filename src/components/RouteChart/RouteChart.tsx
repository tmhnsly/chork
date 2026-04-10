import type { RouteLog } from "@/lib/data";
import { computePoints, isFlash } from "@/lib/data";
import styles from "./routeChart.module.scss";

interface Props {
  routeCount: number;
  logs: Map<string, RouteLog>;
  routeIds: string[];
}

/**
 * Mini bar chart — points per route. Bars fill relative to max (5).
 * Below: zone indicator dots showing which routes have zone claimed.
 */
export function RouteChart({ routeCount, logs, routeIds }: Props) {
  return (
    <div className={styles.chart}>
      <div className={styles.bars}>
        {routeIds.map((routeId) => {
          const log = logs.get(routeId);
          const points = log ? computePoints(log) : 0;
          const flash = log ? isFlash(log) : false;
          const attempted = log && log.attempts > 0 && !log.completed;
          const height = points > 0 ? (points / 5) * 100 : 0;

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
      <span className={styles.dotLabel}>ZONES</span>
    </div>
  );
}
