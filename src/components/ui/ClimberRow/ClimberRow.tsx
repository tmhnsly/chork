"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { UserAvatar, Username } from "@/components/ui";
import styles from "./climberRow.module.scss";

/**
 * The shape every climber list shares — a friend, a suggestion, a
 * search hit, someone to invite. Kept structural rather than a union
 * so the row doesn't have to know which list it is in — everything
 * that differs arrives as `meta`, `note` or `actions`.
 */
export interface ClimberRowClimber {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

interface Props {
  climber: ClimberRowClimber;
  /** Small line under the handle — "3 matches" on a suggestion. */
  meta?: string;
  /** Terminal state word where the buttons were: "Asked", "Friends". */
  note?: string;
  actions?: ReactNode;
}

/**
 * One climber in a list — the friends roster, suggestions, search
 * results, the invite sheet on a match. It began life as the friends
 * screen's `FriendRow` and moved here the day the match screen needed
 * the same row: one feature must not import another's component, and
 * a row that is nothing but identity + slots was a primitive all
 * along.
 *
 * The identity is a link to their profile and the buttons sit outside
 * it — nesting a button inside an anchor is invalid HTML and, more to
 * the point, makes "accept" a coin flip on a phone.
 */
export function ClimberRow({ climber, meta, note, actions }: Props) {
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
