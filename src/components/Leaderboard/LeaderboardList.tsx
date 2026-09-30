"use client";

import { LeaderboardRow, toLeaderboardRowData } from "@/components/ui";
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
              entry={toLeaderboardRowData(entry)}
              highlighted={isSelf}
              interactive={!isSelf}
              onPress={() => onPress(entry)}
            />
          </li>
        );
      })}
    </ul>
  );
}
