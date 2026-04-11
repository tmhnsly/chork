import type { ReactNode } from "react";
import { RingStatsRow } from "@/components/RingStatsRow/RingStatsRow";
import { StatsTabs } from "./StatsTabs";
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
  children?: ReactNode;
}

export function ClimberStats({
  currentSet,
  allTimeCompletions,
  allTimeFlashes,
  allTimePoints,
  children,
}: Props) {
  const tabs = [];

  if (currentSet) {
    tabs.push({
      label: "Current Set",
      content: (
        <div className={styles.tabCard}>
          <RingStatsRow
            completions={currentSet.completions}
            flashes={currentSet.flashes}
            points={currentSet.points}
            totalRoutes={currentSet.totalRoutes}
            maxPoints={currentSet.maxPoints}
            size={72}
          />
        </div>
      ),
    });
  }

  tabs.push({
    label: "All Time",
    content: (
      <div className={styles.tabCard}>
        <RingStatsRow
          completions={allTimeCompletions}
          flashes={allTimeFlashes}
          points={allTimePoints}
          size={72}
        />
      </div>
    ),
  });

  // Grid is rendered separately via children, not inside tabs
  return (
    <div className={styles.wrapper}>
      {tabs.length === 1 ? (
        <>
          <span className={styles.tabLabel}>{tabs[0].label}</span>
          {tabs[0].content}
        </>
      ) : (
        <StatsTabs tabs={tabs} />
      )}
      {children}
    </div>
  );
}
