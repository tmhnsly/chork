"use client";

import type { CSSProperties } from "react";
import { LeaderboardRow, type LeaderboardRowData } from "@/components/ui";
import styles from "./boardRows.module.scss";

interface Props {
  /** Rank order. A row's slot is its distance from the first row's rank. */
  rows: LeaderboardRowData[];
  youId: string;
}

/**
 * Leaderboard rows that slide when the order changes. Rendered in a
 * stable order (by climber, not by rank) so React keeps each row's
 * element and the CSS transition on `--slot` does the moving.
 */
export function BoardRows({ rows, youId }: Props) {
  const stable = [...rows].sort((a, b) => a.userId.localeCompare(b.userId));
  const first = rows[0]?.rank ?? 1;
  return (
    <ul className={styles.rows} style={{ "--row-count": rows.length } as CSSProperties} aria-label="Leaderboard">
      {stable.map((row) => (
        <li
          key={row.userId}
          className={styles.row}
          style={{ "--slot": (row.rank ?? first) - first } as CSSProperties}
        >
          <LeaderboardRow entry={row} highlighted={row.userId === youId} interactive={false} />
        </li>
      ))}
    </ul>
  );
}
