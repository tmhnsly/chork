import type { ReactNode } from "react";
import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { RouteChart } from "@/components/RouteChart/RouteChart";
import type { RouteLog } from "@/lib/data";
import styles from "./climberStats.module.scss";

export interface AllTimeExtras {
  /** 0–1 fraction, null if no sends */
  flashRate: number | null;
  /** Average points per send (1dp), null if no sends */
  pointsPerSend: number | null;
  /** Sum of attempts across completed routes */
  totalAttempts: number;
  /** 0–1 fraction, null if no routes attempted */
  completionRate: number | null;
  uniqueRoutesAttempted: number;
  /** Total routes in the gym across all sets (for coverage denominator) */
  totalRoutesInGym: number;
  /** Current consecutive-set streak */
  streakCurrent: number;
  /** Personal best streak */
  streakBest: number;
}

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
  allTimeExtras?: AllTimeExtras;
  routeIds?: string[];
  routeHasZone?: boolean[];
  logs?: Map<string, RouteLog>;
  children?: ReactNode;
}

const EM_DASH = "\u2014";

function formatPercent(fraction: number | null): string {
  if (fraction === null) return EM_DASH;
  return `${Math.round(fraction * 100)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) return EM_DASH;
  return String(value);
}

export function ClimberStats({
  currentSet,
  allTimeCompletions,
  allTimeFlashes,
  allTimePoints,
  allTimeExtras,
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
      <div className={styles.labelledSection}>
        <span className={styles.sectionLabel}>All Time</span>
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

          {allTimeExtras && (
            <div className={styles.extrasGrid}>
              <ExtraCell
                label="Flash rate"
                value={formatPercent(allTimeExtras.flashRate)}
                emphasis
              />
              <ExtraCell
                label="Pts / send"
                value={allTimeExtras.pointsPerSend === null ? EM_DASH : allTimeExtras.pointsPerSend.toFixed(1)}
              />
              <ExtraCell
                label="Attempts"
                value={formatNumber(allTimeExtras.totalAttempts)}
              />
              <ExtraCell
                label="Completion"
                value={formatPercent(allTimeExtras.completionRate)}
              />
              <ExtraCell
                label="Coverage"
                value={
                  allTimeExtras.totalRoutesInGym > 0
                    ? `${allTimeExtras.uniqueRoutesAttempted}/${allTimeExtras.totalRoutesInGym}`
                    : formatNumber(allTimeExtras.uniqueRoutesAttempted)
                }
              />
              <ExtraCell
                label="Streak"
                value={`${allTimeExtras.streakCurrent}`}
                subtitle={
                  allTimeExtras.streakBest > 0
                    ? `Best ${allTimeExtras.streakBest}`
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Current Set — only if active set exists */}
      {currentSet && (
        <div className={styles.labelledSection}>
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
        </div>
      )}

      {children}
    </div>
  );
}

interface ExtraCellProps {
  label: string;
  value: string;
  subtitle?: string;
  emphasis?: boolean;
}

function ExtraCell({ label, value, subtitle, emphasis }: ExtraCellProps) {
  return (
    <div className={`${styles.extraCell} ${emphasis ? styles.extraCellEmphasis : ""}`}>
      <span className={styles.extraValue}>{value}</span>
      <span className={styles.extraLabel}>{label}</span>
      {subtitle && <span className={styles.extraSubtitle}>{subtitle}</span>}
    </div>
  );
}
