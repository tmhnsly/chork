import Link from "next/link";
import { FaBolt } from "react-icons/fa6";
import { UserAvatar } from "@/components/ui";
import type { LeaderboardEntry } from "@/lib/data";
import { toAvatarUser } from "./helpers";
import styles from "./leaderboardRow.module.scss";

interface Props {
  entry: LeaderboardEntry;
  highlighted?: boolean;
  /** When false, renders as a div (no navigation) — used for the current user's own row. */
  interactive?: boolean;
}

/**
 * Chorkboard row. Tapping navigates to the climber's full profile
 * page rather than opening a peek sheet — a full profile view
 * (achievements, sets, activity) reads as a proper destination and
 * is more useful than a truncated summary.
 */
export function LeaderboardRow({ entry, highlighted, interactive = true }: Props) {
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

  if (!interactive) {
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
    <Link
      href={`/u/${entry.username}`}
      className={className}
      aria-label={`Rank ${rankLabel}, @${entry.username}, ${entry.points} points. Open profile.`}
    >
      {content}
    </Link>
  );
}
