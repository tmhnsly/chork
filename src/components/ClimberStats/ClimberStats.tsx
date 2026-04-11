import type { ReactNode } from "react";
import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import { StatsTabs } from "./StatsTabs";
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
  children?: ReactNode;
}

function RingStats({ stats, children }: { stats: SetStats; children?: ReactNode }) {
  const completionRate = stats.totalRoutes
    ? stats.completions / stats.totalRoutes : 0;
  const scoreRate = stats.maxPoints
    ? stats.points / stats.maxPoints : 0;
  const flashRate = stats.completions > 0
    ? stats.flashes / stats.completions : 0;

  return (
    <div className={styles.statsContent}>
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
      {children}
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
  const allTimeStats = {
    points: allTimePoints,
    completions: allTimeCompletions,
    flashes: allTimeFlashes,
  };

  const tabs = [];

  if (currentSet) {
    tabs.push({
      label: "Current Set",
      content: <RingStats stats={currentSet}>{children}</RingStats>,
    });
  }

  tabs.push({
    label: "All Time",
    content: <RingStats stats={allTimeStats} />,
  });

  if (tabs.length === 1) {
    return <div className={styles.wrapper}>{tabs[0].content}</div>;
  }

  return (
    <div className={styles.wrapper}>
      <StatsTabs tabs={tabs} />
    </div>
  );
}
