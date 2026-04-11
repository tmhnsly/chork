import type { ReactNode } from "react";
import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import styles from "./climberStats.module.scss";

interface SetStats {
  points: number;
  completions: number;
  flashes: number;
  totalRoutes?: number;
  maxPoints?: number;
}

interface Props {
  currentSet: SetStats | null;
  allTimeCompletions: number;
  allTimeFlashes: number;
  allTimePoints: number;
  /** Mini send grid, rendered below the current set stats */
  children?: ReactNode;
}

function RingStats({ stats }: { stats: SetStats }) {
  const completionRate = stats.totalRoutes
    ? stats.completions / stats.totalRoutes : 0;
  const scoreRate = stats.maxPoints
    ? stats.points / stats.maxPoints : 0;
  const flashRate = stats.completions > 0
    ? stats.flashes / stats.completions : 0;

  return (
    <div className={styles.statsCard}>
      <ActivityRings
        rings={[
          { value: completionRate, color: "var(--accent-solid)" },
          { value: flashRate, color: "var(--flash-solid)" },
          { value: scoreRate, color: "var(--success-solid)" },
        ]}
        size={56}
      />
      <div className={styles.statValues}>
        <div className={styles.stat}>
          <span className={`${styles.value} ${styles.accent}`}>{stats.points}</span>
          <span className={styles.label}>PTS</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.value}>{stats.completions}</span>
          <span className={styles.label}>SENDS</span>
        </div>
        <div className={styles.stat}>
          <span className={`${styles.value} ${styles.flash}`}>{stats.flashes}</span>
          <span className={styles.label}>FLASH</span>
        </div>
      </div>
    </div>
  );
}

export function ClimberStats({
  currentSet,
  allTimeCompletions,
  allTimeFlashes,
  allTimePoints,
  children,
}: Props) {
  return (
    <div className={styles.wrapper}>
      {/* All time first */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>All time</span>
        <RingStats
          stats={{
            points: allTimePoints,
            completions: allTimeCompletions,
            flashes: allTimeFlashes,
          }}
        />
      </section>

      {/* Current set with mini grid below */}
      {currentSet && (
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Current set</span>
          <RingStats stats={currentSet} />
          {children}
        </section>
      )}
    </div>
  );
}
