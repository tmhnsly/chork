"use client";

import type { ReactNode } from "react";
import { FaBolt } from "react-icons/fa6";
import { UserAvatar } from "../UserAvatar";
import styles from "./leaderboardRow.module.scss";

/**
 * Minimal shape a leaderboard row needs to render. Deliberately
 * decoupled from `LeaderboardEntry` (gym leaderboard) and
 * `JamLeaderboardRow` (jam leaderboard) so both surfaces can use
 * the same visual primitive via a tiny adapter at the call site.
 *
 * `rank = null` renders as "—" (the unranked-user fallback).
 */
export interface LeaderboardRowData {
  userId: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  rank: number | null;
  points: number;
  flashes: number;
}

interface Props {
  entry: LeaderboardRowData;
  highlighted?: boolean;
  /**
   * Clickable when both `onPress` is provided AND `interactive`
   * isn't explicitly false. The non-interactive form renders as a
   * `<div>` — used for the caller's own row where tapping doesn't
   * open a sheet.
   */
  onPress?: (entry: LeaderboardRowData) => void;
  interactive?: boolean;
  /**
   * Optional trailing slot rendered after the points + flashes
   * cluster. Use for surface-specific extras — e.g. a zone count
   * on the jam leaderboard. Keep to one or two short glyph/number
   * pairs so the row height stays consistent.
   */
  trailing?: ReactNode;
}

export function LeaderboardRow({
  entry,
  highlighted,
  onPress,
  interactive = true,
  trailing,
}: Props) {
  const className = `${styles.row} ${highlighted ? styles.highlighted : ""}`;
  const rankLabel = entry.rank === null ? "—" : `${entry.rank}`;
  const username = entry.username ?? "unknown";
  const ariaBase = `Rank ${rankLabel}, @${username}, ${entry.points} points`;

  const content = (
    <>
      <span className={styles.rank} aria-hidden="true">{rankLabel}</span>
      <UserAvatar
        user={{
          id: entry.userId,
          username,
          name: entry.name ?? "",
          avatar_url: entry.avatarUrl ?? "",
        }}
        size={36}
      />
      <div className={styles.identity}>
        <span className={styles.username}>@{username}</span>
        {entry.name && <span className={styles.name}>{entry.name}</span>}
      </div>
      <div className={styles.stats}>
        <span className={styles.points}>{entry.points}</span>
        {entry.flashes > 0 && (
          <span className={styles.flashes} aria-label={`${entry.flashes} flashes`}>
            <FaBolt aria-hidden="true" /> {entry.flashes}
          </span>
        )}
        {trailing}
      </div>
    </>
  );

  if (!interactive || !onPress) {
    return (
      <div className={className} aria-label={ariaBase}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onPress(entry)}
      aria-label={`${ariaBase}. Open profile sheet.`}
    >
      {content}
    </button>
  );
}
