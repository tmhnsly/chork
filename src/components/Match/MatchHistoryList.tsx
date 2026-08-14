import Link from "next/link";
import { FaTrophy, FaCrown } from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import type { MatchHistoryRow } from "@/lib/data/match-types";
import styles from "./matchHistoryList.module.scss";
import { Username } from "@/components/ui";

interface Props {
  matches: MatchHistoryRow[];
}

/**
 * Chronological list of a user's past matches. Used by both the /match
 * recent strip (with a short limit) and the profile Matches section
 * (with pagination). Each row renders the essential identity
 * (name / location / date) plus the viewer's own rank and the
 * winner's handle.
 */
export function MatchHistoryList({ matches }: Props) {
  if (matches.length === 0) return null;
  return (
    <ul className={styles.list}>
      {matches.map((match) => (
        <li key={match.set_id}>
          <MatchHistoryRow match={match} />
        </li>
      ))}
    </ul>
  );
}

function MatchHistoryRow({ match }: { match: MatchHistoryRow }) {
  const name = match.name?.trim() || "Untitled match";
  const dateLabel = format(parseISO(match.ended_at), "d MMM");
  const playerLabel =
    match.player_count === 1 ? "1 player" : `${match.player_count} players`;

  return (
    <Link href={`/match/summary/${match.set_id}`} className={styles.row}>
      <div className={styles.body}>
        <span className={styles.title}>{name}</span>
        <span className={styles.meta}>
          {[match.location, dateLabel, playerLabel].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className={styles.result}>
        {match.user_is_winner ? (
          <span className={styles.winnerBadge}>
            <FaCrown aria-hidden />
            Winner
          </span>
        ) : (
          <span className={styles.rank}>
            <FaTrophy aria-hidden />
            #{match.user_rank}
          </span>
        )}
        {!match.user_is_winner && match.winner_username && (
          <Username username={match.winner_username} className={styles.winnerHandle} />
        )}
      </div>
    </Link>
  );
}
