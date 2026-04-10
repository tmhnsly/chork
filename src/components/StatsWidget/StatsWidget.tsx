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
  zoneRouteCount: number;
}

export function StatsWidget({
  completions,
  total,
  flashes,
  points,
  logs,
  routeIds,
  zoneRouteCount,
}: Props) {
  const completionRate = total > 0 ? completions / total : 0;
  const flashRate = completions > 0 ? flashes / completions : 0;
  const maxPoints = total * 4 + zoneRouteCount;
  const scoreRate = maxPoints > 0 ? points / maxPoints : 0;

  return (
    <div className={styles.widget}>
      <div className={styles.left}>
        <ActivityRings
          rings={[
            { value: completionRate, color: "var(--accent-solid)" },
            { value: scoreRate, color: "var(--mono-text-low-contrast)" },
            { value: flashRate, color: "var(--flash-solid)" },
          ]}
          size={72}
        />

        <div className={styles.statLines}>
          <div className={styles.statLine}>
            <span className={styles.statLabel}>Sends</span>
            <span className={`${styles.statValue} ${styles.accent}`}>
              {completions}/{total}
            </span>
          </div>
          <div className={styles.statLine}>
            <span className={styles.statLabel}>Score</span>
            <span className={styles.statValue}>
              {points}<small>PTS</small>
            </span>
          </div>
          <div className={styles.statLine}>
            <span className={styles.statLabel}>Flashes</span>
            <span className={`${styles.statValue} ${styles.flash}`}>
              {flashes}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.chartBlock}>
          <span className={styles.chartLabel}>SCORE</span>
          <RouteChart
            routeCount={total}
            logs={logs}
            routeIds={routeIds}
          />
        </div>
      </div>
    </div>
  );
}
