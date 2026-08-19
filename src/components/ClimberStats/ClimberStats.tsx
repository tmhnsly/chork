import type { ReactNode } from "react";
import { StatsWidget } from "@/components/ui/StatsWidget/StatsWidget";
import type { RouteLog } from "@/lib/data";
import styles from "./climberStats.module.scss";

interface Props {
  currentSet: {
    points: number;
    completions: number;
    flashes: number;
    totalRoutes: number;
    /** Reset countdown string (e.g. "4d" / "2w5d" / "today"). */
    resetIn?: string;
    /** Leaderboard placement for this climber on the active set. */
    rank?: number | null;
  } | null;
  /** Name of the climber's active gym — surfaced in the current-set card meta. */
  gymName?: string | null;
  routeIds?: string[];
  routeHasZone?: boolean[];
  routeNumbers?: number[];
  logs?: Map<string, RouteLog>;
  children?: ReactNode;
}

export function ClimberStats({
  currentSet,
  gymName,
  routeIds,
  routeHasZone,
  routeNumbers,
  logs,
  children,
}: Props) {
  return (
    <div className={styles.wrapper}>
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
          resetIn={currentSet.resetIn}
          gymName={gymName}
          rank={currentSet.rank}
        />
      )}

      {children}
    </div>
  );
}
