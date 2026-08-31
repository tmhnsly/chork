import Link from "next/link";
import { FaTrophy } from "react-icons/fa6";
import { createServerSupabase } from "@/lib/supabase/server";
import { getMyLeagues } from "@/lib/data/league-queries";
import { SectionCard } from "@/components/ui/SectionCard";
import { countOf } from "@/lib/plural";
import styles from "./profileLeaguesSection.module.scss";

/**
 * The climber's leagues on their own profile — the fixture record no
 * other climbing app has. One row per league from `get_my_leagues`:
 * where you stand, how many weeks it's run, whether you host it.
 *
 * Own profile only, and not by accident: the RPC is caller-scoped, so
 * this section can't leak league membership to visitors. When a
 * shared-leagues read exists (leagues the viewer and the profile's
 * owner are both in), visited profiles get their version.
 *
 * Hidden entirely with no leagues — a quiet profile beats an empty
 * axis.
 */
export async function ProfileLeaguesSection() {
  const supabase = await createServerSupabase();
  const leagues = await getMyLeagues(supabase);

  if (leagues.length === 0) return null;

  return (
    <SectionCard
      title="Leagues"
      icon={<FaTrophy />}
      meta={countOf(leagues.length, "league", "leagues")}
    >
      <ul className={styles.rows}>
        {leagues.map((l) => (
          <li key={l.id}>
            <Link
              href={`/match/league/${l.id}`}
              className={`${styles.row} ${l.ended_at ? styles.rowEnded : ""}`}
            >
              <span className={styles.name}>
                {l.name}
                {l.is_host && <span className={styles.hostChip}>Host</span>}
              </span>
              <span className={styles.standing}>
                {l.my_rank !== null && (
                  <span className={styles.rank}>#{l.my_rank}</span>
                )}
                <span className={styles.weeks}>
                  {countOf(l.week_count, "week", "weeks")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
