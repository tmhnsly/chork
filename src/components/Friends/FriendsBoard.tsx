import { LeaderboardRow } from "@/components/ui";
import type { FriendBoardRow } from "@/lib/data/friend-queries";
import { countOf } from "@/lib/plural";
import styles from "./friendsBoard.module.scss";

interface Props {
  rows: FriendBoardRow[];
  /** The Set being ranked on — named so it's clear what's being compared. */
  setLabel: string;
}

/**
 * You and your friends on the current Set.
 *
 * What a crew was actually for, without the group to name. Rendered
 * only when the viewer has a gym with a live Set — points compare
 * inside one Set and nowhere else, so there is nothing honest to show
 * a gymless climber here.
 *
 * A friend who hasn't scored yet still gets a row. They turned up;
 * that's more interesting than a gap in the list.
 */
export function FriendsBoard({ rows, setLabel }: Props) {
  if (rows.length < 2) return null;

  return (
    <section className={styles.section} aria-labelledby="friends-board">
      <h2 id="friends-board" className={styles.heading}>
        On {setLabel}
      </h2>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.user_id}>
            <LeaderboardRow
              entry={{
                userId: row.user_id,
                username: row.username,
                name: row.name,
                avatarUrl: row.avatar_url,
                rank: row.rank,
                points: row.points,
                flashes: row.flashes,
              }}
              highlighted={row.is_self}
              href={row.username ? `/u/${row.username}` : undefined}
              trailing={
                <span className={styles.sends} aria-label={countOf(row.sends, "send")}>
                  {row.sends}
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
