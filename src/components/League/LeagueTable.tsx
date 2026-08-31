import { UserAvatar, Username } from "@/components/ui";
import { seatAvatarUser, seatName } from "@/lib/data/seat";
import type { LeagueStanding } from "@/lib/data/league-types";
import { LEAGUE_LADDER, describeDropRule } from "@/lib/data/league";
import { countOf } from "@/lib/plural";
import styles from "./leagueTable.module.scss";

interface Props {
  standings: LeagueStanding[];
  /** Archived weeks — what the drop rule counts against. */
  weekCount: number;
  viewerId: string;
}

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/**
 * The table. Rank · face · name · points · played, the caller's own
 * row in accent (the leaderboard vocabulary: accent means "yours").
 * Under it, the ladder and the drop rule in one line each, because a
 * table nobody can explain is a table nobody trusts.
 */
export function LeagueTable({ standings, weekCount, viewerId }: Props) {
  return (
    <div className={styles.wrap}>
      {standings.length === 0 ? (
        <p className={styles.empty}>No weeks yet — end the first match and it lands here.</p>
      ) : (
        <ol className={styles.list}>
          {standings.map((row) => {
            const username = row.username ?? "unknown";
            const mine = row.user_id === viewerId;
            return (
              <li key={row.user_id} className={`${styles.row} ${mine ? styles.mine : ""}`}>
                <span className={styles.rank}>#{row.rank}</span>
                <UserAvatar user={seatAvatarUser(row)} size="row" />
                <div className={styles.identity}>
                  <span className={styles.name}>{seatName(row)}</span>
                  <span className={styles.handle}>
                    <Username username={username} />
                    {" · "}
                    {countOf(row.played, "week")}
                    {row.firsts > 0 && ` · ${countOf(row.firsts, "win")}`}
                  </span>
                </div>
                <div className={styles.points}>
                  <span className={styles.total}>{row.points}</span>
                  {row.dropped_points > 0 && (
                    <span className={styles.dropped}>−{row.dropped_points} dropped</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className={styles.rule}>{describeDropRule(weekCount)}</p>
      <p className={styles.legend}>
        {LEAGUE_LADDER.map((pts, i) => `${ORDINAL[i]} ${pts}`).join(" · ")} · then 1
      </p>
    </div>
  );
}
