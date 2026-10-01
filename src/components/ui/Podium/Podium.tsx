"use client";

import { FaCrown } from "react-icons/fa6";
import { UserAvatar } from "../UserAvatar";
import { Username } from "../Username";
import type { LeaderboardEntry } from "@/lib/data";
import { seatAvatarUser } from "@/lib/data/seat";
import styles from "./podium.module.scss";
import { countOfFormatted } from "@/lib/plural";

interface Props {
  /** Entries sorted by rank ascending. Renders up to 3 positions. */
  top: LeaderboardEntry[];
  currentUserId: string;
  onPress: (entry: LeaderboardEntry) => void;
  /**
   * User ID of the climber whose profile sheet is currently open (if
   * any). The matching podium slot stays in its hover-grow state
   * while the sheet is visible and snaps back down when the sheet
   * closes — matches the "selected" intent without forcing a tap-
   * state lock.
   */
  activeUserId?: string | null;
  /**
   * Play the build-out on mount (default). Off where the podium is
   * re-ranked in place and its columns move: a moved column is a
   * re-inserted node, and re-insertion restarts a CSS animation, so
   * every move would fade the climbers it touched back in from
   * nothing. The marketing board turns it off.
   */
  entrance?: boolean;
}

/**
 * Podium visualisation for top 3 climbers.
 * Layout order: [2nd, 1st, 3rd] — 1st is centred and tallest.
 * Gracefully renders 1 or 2 positions by omitting empty slots.
 */
export function Podium({ top, currentUserId, onPress, activeUserId, entrance = true }: Props) {
  // Map rank-ordered entries to visual slots: 2nd on left, 1st centre, 3rd right
  const first = top[0];
  const second = top[1];
  const third = top[2];

  return (
    <ul className={entrance ? styles.podium : `${styles.podium} ${styles.still}`} aria-label="Top climbers">
      {/* `--i` is the entrance beat: the winner first, the sides a
          beat later, so the podium builds outward from first place.
          Keyed by climber, not by place, so a re-rank moves a
          climber's element to its new slot rather than repainting
          three slots in place — which is what lets a FLIP animate
          the move (the marketing board does; see `useFlip`).
          `data-flip-key` is that hook's handle. */}
      {second && <li key={second.user_id} data-flip-key={second.user_id} style={{ "--i": 1 } as React.CSSProperties}><Slot entry={second} place={2} currentUserId={currentUserId} onPress={onPress} active={activeUserId === second.user_id} /></li>}
      {first && <li key={first.user_id} data-flip-key={first.user_id} style={{ "--i": 0 } as React.CSSProperties}><Slot entry={first} place={1} currentUserId={currentUserId} onPress={onPress} active={activeUserId === first.user_id} /></li>}
      {third && <li key={third.user_id} data-flip-key={third.user_id} style={{ "--i": 2 } as React.CSSProperties}><Slot entry={third} place={3} currentUserId={currentUserId} onPress={onPress} active={activeUserId === third.user_id} /></li>}
    </ul>
  );
}

interface SlotProps {
  entry: LeaderboardEntry;
  place: 1 | 2 | 3;
  currentUserId: string;
  onPress: (entry: LeaderboardEntry) => void;
  active?: boolean;
}

function Slot({ entry, place, currentUserId, onPress, active }: SlotProps) {
  const isSelf = entry.user_id === currentUserId;
  const className = [
    styles.slot,
    styles[`place${place}`],
    isSelf ? styles.self : "",
    active ? styles.slotActive : "",
  ].filter(Boolean).join(" ");

  const avatarSize = place === 1 ? "podiumWin" : "podium";

  const content = (
    <>
      <div className={styles.avatarWrap}>
        {place === 1 && <FaCrown className={styles.crown} aria-hidden />}
        <UserAvatar user={seatAvatarUser(entry)} size={avatarSize} priority />
        <span className={styles.medal} aria-hidden>{place}</span>
      </div>
      <Username username={entry.username} className={styles.username} />
      <span className={styles.points}>{entry.points} pts</span>
      <div className={styles.plinth} aria-hidden="true">
        <span className={styles.placeLabel}>{place}</span>
      </div>
    </>
  );

  const ariaLabel = `Rank ${place}, @${entry.username}, ${countOfFormatted(entry.points, "point")}${isSelf ? " (you)" : ""}`;

  if (isSelf) {
    return (
      <div className={className} aria-label={ariaLabel}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onPress(entry)}
      aria-label={`${ariaLabel}. Open profile sheet.`}
    >
      {content}
    </button>
  );
}
