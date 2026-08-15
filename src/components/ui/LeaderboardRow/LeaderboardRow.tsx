"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FaBolt } from "react-icons/fa6";
import { UserAvatar } from "../UserAvatar";
import styles from "./leaderboardRow.module.scss";
import { Username } from "../Username";

/**
 * Minimal shape a leaderboard row needs to render. Deliberately
 * decoupled from `LeaderboardEntry` (gym leaderboard) and
 * `MatchLeaderboardRow` (match leaderboard) so both surfaces can use
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
  /**
   * Pre-formatted by the caller. A gym board passes a whole number; a
   * handicapped Match passes something like "4.7", since scoring
   * relative to a ceiling stops totals being integers.
   */
  points: number | string;
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
   * Navigation variant — renders the row as a Next `<Link>` with the
   * same visual instead of a `<button>`. For surfaces where tapping a
   * row goes to the climber's profile page (crew leaderboard) rather
   * than opening a sheet. Mutually exclusive with `onPress`: pass one
   * or the other, so a row is always exactly one interactive element.
   */
  href?: string;
  /**
   * Optional trailing slot rendered after the points + flashes
   * cluster. Use for surface-specific extras — e.g. a zone count
   * on the match leaderboard. Keep to one or two short glyph/number
   * pairs so the row height stays consistent.
   */
  trailing?: ReactNode;
  /**
   * A guest — a named seat in a Match with no account. They have no
   * handle, so the row shows their name on its own rather than an
   * invented one.
   */
  isGuest?: boolean;
}

export function LeaderboardRow({
  entry,
  highlighted,
  onPress,
  interactive = true,
  href,
  trailing,
  isGuest = false,
}: Props) {
  const className = `${styles.row} ${highlighted ? styles.highlighted : ""}`;
  const rankLabel = entry.rank === null ? "—" : `${entry.rank}`;
  const username = entry.username ?? "unknown";
  // A guest has no handle. Showing "@unknown" reads as a bug — and to
  // the person whose name it is, as rudeness.
  const displayLabel = isGuest ? (entry.name || "Guest") : `@${username}`;
  const ariaBase = `Rank ${rankLabel}, ${displayLabel}, ${entry.points} points`;

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
        size="row"
      />
      <div className={styles.identity}>
        {isGuest ? (
          <>
            <span className={styles.username}>{entry.name || "Guest"}</span>
            <span className={styles.name}>Guest</span>
          </>
        ) : (
          <>
            <Username username={username} className={styles.username} />
            {entry.name && <span className={styles.name}>{entry.name}</span>}
          </>
        )}
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

  if (href && interactive) {
    return (
      <Link
        href={href}
        className={className}
        aria-label={`${ariaBase}. Open profile.`}
      >
        {content}
      </Link>
    );
  }

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
