import type { ReactNode } from "react";
import { FaInfinity } from "react-icons/fa6";
import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatsWidget } from "@/components/StatsWidget/StatsWidget";
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
    totalRoutes: number;
    resetDate?: string;
  } | null;
  allTimeCompletions: number;
  allTimeFlashes: number;
  allTimePoints: number;
  allTimeExtras?: AllTimeExtras;
  /** Name of the climber's active gym — surfaced in the current-set card meta. */
  gymName?: string | null;
  routeIds?: string[];
  routeHasZone?: boolean[];
  routeNumbers?: number[];
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
  gymName,
  routeIds,
  routeHasZone,
  routeNumbers,
  logs,
  children,
}: Props) {
  const flashRate = allTimeCompletions > 0 ? allTimeFlashes / allTimeCompletions : 0;

  return (
    <div className={styles.wrapper}>
      <SectionCard title="All Time" icon={<FaInfinity />}>
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
      </SectionCard>

      {currentSet && routeIds && routeHasZone && logs && (
        <StatsWidget
          completions={currentSet.completions}
          total={currentSet.totalRoutes}
          flashes={currentSet.flashes}
          points={currentSet.points}
          logs={logs}
          routeIds={routeIds}
          routeHasZone={routeHasZone}
          routeNumbers={routeNumbers}
          resetDate={currentSet.resetDate}
          gymName={gymName}
        />
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
