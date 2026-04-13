"use client";

import { FaCrown } from "react-icons/fa6";
import { UserAvatar } from "@/components/ui";
import type { LeaderboardEntry } from "@/lib/data";
import { toAvatarUser } from "./helpers";
import { PODIUM_AVATAR_SIZE_FIRST, PODIUM_AVATAR_SIZE_RUNNER_UP } from "./podium-constants";
import styles from "./podium.module.scss";

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
}

/**
 * Podium visualisation for top 3 climbers.
 * Layout order: [2nd, 1st, 3rd] — 1st is centred and tallest.
 * Gracefully renders 1 or 2 positions by omitting empty slots.
 */
export function Podium({ top, currentUserId, onPress, activeUserId }: Props) {
  // Map rank-ordered entries to visual slots: 2nd on left, 1st centre, 3rd right
  const first = top[0];
  const second = top[1];
  const third = top[2];

  return (
    <ul className={styles.podium} aria-label="Top climbers">
      {second && <li><Slot entry={second} place={2} currentUserId={currentUserId} onPress={onPress} active={activeUserId === second.user_id} /></li>}
      {first && <li><Slot entry={first} place={1} currentUserId={currentUserId} onPress={onPress} active={activeUserId === first.user_id} /></li>}
      {third && <li><Slot entry={third} place={3} currentUserId={currentUserId} onPress={onPress} active={activeUserId === third.user_id} /></li>}
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

  const avatarSize = place === 1 ? PODIUM_AVATAR_SIZE_FIRST : PODIUM_AVATAR_SIZE_RUNNER_UP;

  const content = (
    <>
      <div className={styles.avatarWrap}>
        {place === 1 && <FaCrown className={styles.crown} aria-hidden />}
        <UserAvatar user={toAvatarUser(entry)} size={avatarSize} priority />
        <span className={styles.medal} aria-hidden>{place}</span>
      </div>
      <span className={styles.username}>@{entry.username}</span>
      <span className={styles.points}>{entry.points} pts</span>
      <div className={styles.plinth} aria-hidden="true">
        <span className={styles.placeLabel}>{place}</span>
      </div>
    </>
  );

  const ariaLabel = `Rank ${place}, @${entry.username}, ${entry.points} points${isSelf ? " (you)" : ""}`;

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
