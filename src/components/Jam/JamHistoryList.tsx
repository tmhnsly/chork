import Link from "next/link";
import { FaTrophy, FaCrown } from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import type { JamHistoryRow } from "@/lib/data/jam-types";
import styles from "./jamHistoryList.module.scss";

interface Props {
  jams: JamHistoryRow[];
}

/**
 * Chronological list of a user's past jams. Used by both the /jam
 * recent strip (with a short limit) and the profile Jams section
 * (with pagination). Each row renders the essential identity
 * (name / location / date) plus the viewer's own rank and the
 * winner's handle.
 */
export function JamHistoryList({ jams }: Props) {
  if (jams.length === 0) return null;
  return (
    <ul className={styles.list}>
      {jams.map((jam) => (
        <li key={jam.summary_id}>
          <JamHistoryRow jam={jam} />
        </li>
      ))}
    </ul>
  );
}

function JamHistoryRow({ jam }: { jam: JamHistoryRow }) {
  const name = jam.name?.trim() || "Untitled jam";
  const dateLabel = format(parseISO(jam.ended_at), "d MMM");
  const playerLabel =
    jam.player_count === 1 ? "1 player" : `${jam.player_count} players`;

  return (
    <Link href={`/jam/summary/${jam.summary_id}`} className={styles.row}>
      <div className={styles.body}>
        <span className={styles.title}>{name}</span>
        <span className={styles.meta}>
          {[jam.location, dateLabel, playerLabel].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className={styles.result}>
        {jam.user_is_winner ? (
          <span className={styles.winnerBadge}>
            <FaCrown aria-hidden />
            Winner
          </span>
        ) : (
          <span className={styles.rank}>
            <FaTrophy aria-hidden />
            #{jam.user_rank}
          </span>
        )}
        {!jam.user_is_winner && jam.winner_username && (
          <span className={styles.winnerHandle}>@{jam.winner_username}</span>
        )}
      </div>
    </Link>
  );
}
