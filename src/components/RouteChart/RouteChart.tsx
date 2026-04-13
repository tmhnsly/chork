import type { RouteLog } from "@/lib/data";
import { computePoints, isFlash } from "@/lib/data";
import styles from "./routeChart.module.scss";

interface Props {
  logs: Map<string, RouteLog>;
  routeIds: string[];
  /** Whether each route has a zone hold — used to compute per-route max points */
  routeHasZone: boolean[];
  /**
   * Route numbers shown underneath each column. Optional so existing
   * callers (skeletons, storybook) don't have to plumb them through.
   */
  routeNumbers?: number[];
}

/**
 * Stride between labelled columns based on route count. We always
 * keep the first and last columns labelled so the chart is readable
 * end-to-end — the stride controls which middle columns get a number.
 *
 * These thresholds target the wall's usual route counts (14–40) but
 * degrade gracefully: a 100-route comp will show ~1, 10, 20, … 100.
 */
function labelStride(n: number): number {
  if (n <= 20) return 1;
  if (n <= 40) return 2;
  if (n <= 80) return 5;
  if (n <= 150) return 10;
  return Math.ceil(n / 15);
}

/**
 * Mini bar chart — points per route. Each bar fills relative to that route's
 * max possible score (4 for non-zone, 5 for zone routes).
 * Below: zone indicator dots, then a thin axis of route numbers.
 */
export function RouteChart({ logs, routeIds, routeHasZone, routeNumbers }: Props) {
  const stride = labelStride(routeIds.length);
  const lastIdx = routeIds.length - 1;
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

      {routeNumbers && (
        <div className={styles.labels} aria-hidden>
          {routeIds.map((routeId, i) => {
            // Always label the first and last column; label the middle
            // ones on the stride. Empty slots still render so columns
            // stay aligned with the bars above.
            const show = i === 0 || i === lastIdx || i % stride === 0;
            return (
              <span key={routeId} className={styles.label}>
                {show ? routeNumbers[i] : ""}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
