import type { ReactNode } from "react";
import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import type { RouteLog } from "@/lib/data";
import styles from "./climberStats.module.scss";

interface Props {
  currentSet: {
    points: number;
    completions: number;
    flashes: number;
    totalRoutes?: number;
    maxPoints?: number;
  } | null;
  allTimeCompletions: number;
  allTimeFlashes: number;
  allTimePoints: number;
  routeIds?: string[];
  routeHasZone?: boolean[];
  logs?: Map<string, RouteLog>;
  children?: ReactNode;
}

export function ClimberStats({
  currentSet,
  allTimeCompletions,
  allTimeFlashes,
  allTimePoints,
  routeIds,
  routeHasZone,
  logs,
  children,
}: Props) {
  const hasChart = routeIds && routeHasZone && logs;
  const flashRate = allTimeCompletions > 0 ? allTimeFlashes / allTimeCompletions : 0;

  return (
    <div className={styles.wrapper}>
      {/* All Time — always visible at top */}
      <div className={styles.allTimeCard}>
        <div className={styles.allTimeHeader}>
          <ActivityRings
            rings={[{ value: flashRate, color: "var(--flash-solid)" }]}
            size={56}
          />
          <div className={styles.allTimeStats}>
            <div className={styles.allTimeStat}>
              <span className={`${styles.allTimeValue} ${styles.accent}`}>{allTimeCompletions}</span>
              <span className={styles.allTimeLabel}>SENDS</span>
            </div>
            <div className={styles.allTimeStat}>
              <span className={`${styles.allTimeValue} ${styles.flash}`}>{allTimeFlashes}</span>
              <span className={styles.allTimeLabel}>FLASHES</span>
            </div>
            <div className={styles.allTimeStat}>
              <span className={`${styles.allTimeValue} ${styles.points}`}>{allTimePoints}</span>
              <span className={styles.allTimeLabel}>POINTS</span>
            </div>
          </div>
        </div>
        <span className={styles.allTimeTag}>All Time</span>
      </div>

      {/* Current Set — only if active set exists */}
      {currentSet && (
        <>
          <span className={styles.sectionLabel}>Current Set</span>
          <div className={styles.currentSetCard}>
            <RingStatsRow
              completions={currentSet.completions}
              flashes={currentSet.flashes}
              points={currentSet.points}
              totalRoutes={currentSet.totalRoutes}
              maxPoints={currentSet.maxPoints}
              size={72}
            />
            {hasChart && (
              <>
                <RouteChart
                  logs={logs}
                  routeIds={routeIds}
                  routeHasZone={routeHasZone}
                />
                <div className={styles.chartFooter}>
                  <span className={styles.footerLabel}>ZONE</span>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {children}
    </div>
  );
}
