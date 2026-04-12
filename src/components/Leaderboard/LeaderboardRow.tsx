"use client";

import { FaBolt } from "react-icons/fa6";
import { UserAvatar } from "@/components/ui";
import type { LeaderboardEntry } from "@/lib/data";
import { toAvatarUser } from "./helpers";
import styles from "./leaderboardRow.module.scss";

interface Props {
  entry: LeaderboardEntry;
  highlighted?: boolean;
  onPress?: (entry: LeaderboardEntry) => void;
  /** When true, renders as a div (not clickable) — used for the current user */
  interactive?: boolean;
}

export function LeaderboardRow({ entry, highlighted, onPress, interactive = true }: Props) {
  const className = `${styles.row} ${highlighted ? styles.highlighted : ""}`;
  const rankLabel = entry.rank === null ? "—" : `${entry.rank}`;
  const content = (
    <>
      <span className={styles.rank} aria-hidden="true">{rankLabel}</span>
      <UserAvatar user={toAvatarUser(entry)} size={36} />
      <div className={styles.identity}>
        <span className={styles.username}>@{entry.username}</span>
        {entry.name && <span className={styles.name}>{entry.name}</span>}
      </div>
      <div className={styles.stats}>
        <span className={styles.points}>{entry.points}</span>
        {entry.flashes > 0 && (
          <span className={styles.flashes} aria-label={`${entry.flashes} flashes`}>
            <FaBolt aria-hidden="true" /> {entry.flashes}
          </span>
        )}
      </div>
    </>
  );

  if (!interactive || !onPress) {
    return (
      <div
        className={className}
        aria-label={`Rank ${rankLabel}, @${entry.username}, ${entry.points} points`}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onPress(entry)}
      aria-label={`Rank ${rankLabel}, @${entry.username}, ${entry.points} points. Open profile sheet.`}
    >
      {content}
    </button>
  );
}
