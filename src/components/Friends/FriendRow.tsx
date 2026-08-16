"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { UserAvatar, Username } from "@/components/ui";
import styles from "./friendRow.module.scss";

/**
 * The shape both a friend and a suggestion share. Kept structural
 * rather than a union so the row doesn't have to know which list it
 * is in — everything that differs arrives as `meta`, `note` or
 * `actions`.
 */
interface Climber {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

interface Props {
  climber: Climber;
  /** Small line under the handle — "3 matches" on a suggestion. */
  meta?: string;
  /** Terminal state word where the buttons were: "Asked", "Friends". */
  note?: string;
  actions?: ReactNode;
}

/**
 * One climber in any of the friends lists.
 *
 * The identity is a link to their profile and the buttons sit outside
 * it — nesting a button inside an anchor is invalid HTML and, more to
 * the point, makes "accept" a coin flip on a phone.
 */
export function FriendRow({ climber, meta, note, actions }: Props) {
  const username = climber.username ?? "unknown";

  return (
    <div className={styles.row}>
      <Link
        href={`/u/${username}`}
        className={styles.identity}
        aria-label={`Go to @${username}'s profile`}
      >
        <UserAvatar
          user={{
            id: climber.user_id,
            username,
            name: climber.name ?? "",
            avatar_url: climber.avatar_url ?? "",
          }}
          size="row"
        />
        <span className={styles.text}>
          <Username username={username} className={styles.handle} />
          {climber.name && <span className={styles.name}>{climber.name}</span>}
          {meta && <span className={styles.meta}>{meta}</span>}
        </span>
      </Link>
      {note ? (
        <span className={styles.note}>{note}</span>
      ) : (
        actions && <div className={styles.actions}>{actions}</div>
      )}
    </div>
  );
}
