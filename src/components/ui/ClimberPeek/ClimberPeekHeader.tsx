"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { UserAvatar } from "../UserAvatar";
import styles from "./climberPeekHeader.module.scss";

interface AvatarUser {
  id: string;
  username: string;
  name: string;
  avatar_url: string;
}

interface StatEntry {
  /** Visible label, e.g. "Sends" or "Points". */
  label: string;
  value: number | string;
  /** Optional leading glyph (FaBolt for flashes, FaFlag for zones, etc.). */
  icon?: ReactNode;
  /** Optional accent — drives `var(--flash-text)` / `var(--success-text)`. */
  tone?: "flash" | "success";
}

interface Props {
  /**
   * Avatar payload + username for the profile link. The username is
   * the canonical link target — display name is just for display.
   */
  user: AvatarUser;
  /**
   * Optional right-side meta. Typically the ordinal rank chip
   * (`#1`, `#12`, etc.). Sits next to the linked identity in the
   * sticky title row.
   */
  trailing?: ReactNode;
  /**
   * Row of small stat cells beneath the identity row. Lives in the
   * sticky chrome so it doesn't scroll with the body content under
   * it — at-a-glance climbing stats for the peeked climber.
   */
  stats: StatEntry[];
}

/**
 * Shared sticky-chrome header for "peek another climber" sheets —
 * leaderboard climber peek and jam player grid peek. Avatar + name
 * is the link to the climber's profile; the rest of the sheet's
 * body can be just the grid (or whatever content), and the chrome
 * stays pinned while the body scrolls underneath.
 *
 * Render `identity()` into BottomSheet's `titleSlot` and `stats()`
 * into `subheader`. Two-call render so consumers can put each piece
 * in the correct sheet slot without exposing the internal layout.
 */
export function ClimberPeekHeader({ user, trailing, stats }: Props) {
  return {
    identity: (
      <>
        <Link
          href={`/u/${user.username}`}
          className={styles.identityLink}
          aria-label={`Go to @${user.username}'s profile`}
        >
          <UserAvatar user={user} size={44} />
          <span className={styles.identityText}>
            <span className={styles.displayName}>
              {user.name?.trim() || `@${user.username}`}
            </span>
            {user.name?.trim() && (
              <span className={styles.handle}>@{user.username}</span>
            )}
          </span>
        </Link>
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </>
    ),
    stats: (
      <ul className={styles.statsRow} aria-label="Climber stats">
        {stats.map((s) => (
          <li
            key={s.label}
            className={`${styles.statCell} ${s.tone ? styles[`tone--${s.tone}`] : ""}`}
          >
            <span className={styles.statValue}>
              {s.icon && (
                <span className={styles.statIcon} aria-hidden>
                  {s.icon}
                </span>
              )}
              {s.value}
            </span>
            <span className={styles.statLabel}>{s.label}</span>
          </li>
        ))}
      </ul>
    ),
  };
}
