"use client";

import { LeaderboardRow, type LeaderboardRowData } from "@/components/ui";
import type { LeaderboardEntry } from "@/lib/data";
import styles from "./leaderboardList.module.scss";

interface Props {
  rows: LeaderboardEntry[];
  currentUserId: string;
  onPress: (entry: LeaderboardEntry) => void;
  ariaLabel: string;
}

/** Adapter — the shared `LeaderboardRow` primitive is decoupled from
 *  the gym-specific `LeaderboardEntry` shape so it can be reused on
 *  the jam screen (which carries `display_name` etc). This module
 *  owns the mapping one direction; the press callback adapts back. */
function toRowData(entry: LeaderboardEntry): LeaderboardRowData {
  return {
    userId: entry.user_id,
    username: entry.username,
    name: entry.name,
    avatarUrl: entry.avatar_url,
    rank: entry.rank,
    points: entry.points,
    flashes: entry.flashes,
  };
}

export function LeaderboardList({ rows, currentUserId, onPress, ariaLabel }: Props) {
  return (
    <ul className={styles.list} aria-label={ariaLabel}>
      {rows.map((entry) => {
        const isSelf = entry.user_id === currentUserId;
        return (
          <li key={entry.user_id}>
            <LeaderboardRow
              entry={toRowData(entry)}
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
