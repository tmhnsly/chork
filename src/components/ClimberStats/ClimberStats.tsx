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
      label: "Current Wall",
      content: (
        <div className={styles.tabContent}>
          <RingStatsRow
            completions={currentSet.completions}
            flashes={currentSet.flashes}
            points={currentSet.points}
            totalRoutes={currentSet.totalRoutes}
            maxPoints={currentSet.maxPoints}
          />
          {children}
        </div>
      ),
    });
  }

  tabs.push({
    label: "All Time",
    content: (
      <div className={styles.tabContent}>
        <RingStatsRow
          completions={allTimeCompletions}
          flashes={allTimeFlashes}
          points={allTimePoints}
        />
      </div>
    ),
  });

  if (tabs.length === 1) {
    return (
      <div className={styles.wrapper}>
        <span className={styles.tabLabel}>{tabs[0].label}</span>
        {tabs[0].content}
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <StatsTabs tabs={tabs} />
    </div>
  );
}
