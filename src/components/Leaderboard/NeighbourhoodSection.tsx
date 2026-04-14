"use client";

import { LeaderboardList } from "./LeaderboardList";
import type { LeaderboardEntry } from "@/lib/data";
import styles from "./neighbourhoodSection.module.scss";

interface Props {
  rows: LeaderboardEntry[];
  currentUserId: string;
  onPress: (entry: LeaderboardEntry) => void;
}

export function NeighbourhoodSection({ rows, currentUserId, onPress }: Props) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Your neighbourhood</h2>
      <LeaderboardList
        rows={rows}
        currentUserId={currentUserId}
        onPress={onPress}
        ariaLabel="Climbers near your rank"
      />
    </section>
  );
}
