import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import { RouteChart } from "@/components/RouteChart/RouteChart";
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
}

export function StatsWidget({
  completions,
  total,
  flashes,
  points,
  logs,
  routeIds,
  routeHasZone,
}: Props) {
  const zoneRouteCount = routeHasZone.filter(Boolean).length;
  const completionRate = total > 0 ? completions / total : 0;
  const flashRate = completions > 0 ? flashes / completions : 0;
  const maxPoints = total * 4 + zoneRouteCount;
  const scoreRate = maxPoints > 0 ? points / maxPoints : 0;

  return (
    <div className={styles.widget}>
      {/* Chart area */}
      <div className={styles.chartBlock}>
        <RouteChart
          logs={logs}
          routeIds={routeIds}
          routeHasZone={routeHasZone}
        />
      </div>

      {/* Rings + stats */}
      <div className={styles.ringSection}>
        <ActivityRings
          rings={[
            { value: completionRate, color: "var(--accent-solid)" },
            { value: flashRate, color: "var(--flash-solid)" },
            { value: scoreRate, color: "var(--success-solid)" },
          ]}
          size={72}
        />

        <div className={styles.statLines}>
          <div className={styles.statLine}>
            <span className={`${styles.statLabel} ${styles.accentLabel}`}>SENDS</span>
            <span className={`${styles.statValue} ${styles.accent}`}>
              {completions}<small>/{total}</small>
            </span>
          </div>
          <div className={styles.statLine}>
            <span className={`${styles.statLabel} ${styles.flashLabel}`}>FLASHES</span>
            <span className={`${styles.statValue} ${styles.flash}`}>
              {flashes}
            </span>
          </div>
          <div className={styles.statLine}>
            <span className={`${styles.statLabel} ${styles.scoreLabel}`}>SCORE</span>
            <span className={`${styles.statValue} ${styles.score}`}>
              {points}<small>PTS</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
