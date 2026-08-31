import Link from "next/link";
import { format, parseISO } from "date-fns";
import { FaTrophy } from "react-icons/fa6";
import type { MyLeagueRow } from "@/lib/data/league-types";
import { countOf } from "@/lib/plural";
import styles from "./leagueList.module.scss";

interface Props {
  leagues: MyLeagueRow[];
}

/** The fixtures you're in. Name, how far along, where you stand. */
export function LeagueList({ leagues }: Props) {
  if (leagues.length === 0) return null;
  return (
    <ul className={styles.list}>
      {leagues.map((l) => (
        <li key={l.id}>
          <Link href={`/match/league/${l.id}`} className={styles.row}>
            <FaTrophy aria-hidden className={styles.icon} />
            <div className={styles.body}>
              <span className={styles.name}>{l.name}</span>
              <span className={styles.meta}>
                {[
                  countOf(l.week_count, "week"),
                  l.last_week_at ? `last ${format(parseISO(l.last_week_at), "d MMM")}` : null,
                  l.ended_at ? "ended" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {l.my_rank !== null && <span className={styles.rank}>#{l.my_rank}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
