"use client";

import { LeaderboardRow } from "./LeaderboardRow";
import type { LeaderboardEntry } from "@/lib/data";
import styles from "./leaderboardList.module.scss";

interface Props {
  rows: LeaderboardEntry[];
  currentUserId: string;
  onPress: (entry: LeaderboardEntry) => void;
  ariaLabel: string;
}

export function LeaderboardList({ rows, currentUserId, onPress, ariaLabel }: Props) {
  return (
    <ul className={styles.list} aria-label={ariaLabel}>
      {rows.map((entry) => {
        const isSelf = entry.user_id === currentUserId;
        return (
          <li key={entry.user_id}>
            <LeaderboardRow
              entry={entry}
              highlighted={isSelf}
              interactive={!isSelf}
              onPress={onPress}
            />
          </li>
        );
      })}
    </ul>
  );
}
