"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useClientResource } from "@/hooks/use-client-resource";
import { getCompetitionLeaderboard, type CompetitionLeaderboardRow } from "@/lib/data/competition-queries";
import { UserAvatar, shimmerStyles, TabPills, type TabPillOption } from "@/components/ui";
import { toAvatarUser } from "@/lib/data/leaderboard-helpers";
import type { CompetitionCategory } from "@/lib/data/competition-queries";
import styles from "./competitionLeaderboard.module.scss";

interface Props {
  competitionId: string;
  categories: CompetitionCategory[];
  currentUserId: string;
}

/**
 * Climber-facing competition leaderboard with a category pill filter.
 * Data comes from the `get_competition_leaderboard` RPC (migration 017)
 * — aggregation happens in Postgres, this component only handles the
 * category segment switch and the row layout.
 */
export function CompetitionLeaderboard({
  competitionId,
  categories,
  currentUserId,
}: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Keyed fetch — the hook derives the loading state (rows === null)
  // from a key mismatch, so switching category re-enters the skeleton
  // without any setState-in-effect dance.
  const { data: rows } = useClientResource<CompetitionLeaderboardRow[]>(
    `${competitionId}|${categoryId ?? ""}`,
    () =>
      getCompetitionLeaderboard(createBrowserSupabase(), competitionId, categoryId),
  );

  const pills = useMemo<TabPillOption<string | null>[]>(() => {
    if (categories.length === 0) return [];
    return [
      { value: null, label: "All" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ];
  }, [categories]);

  return (
    <section className={styles.section} aria-label="Competition leaderboard">
      {pills.length > 0 && (
        <TabPills
          options={pills}
          value={categoryId}
          onChange={setCategoryId}
          ariaLabel="Filter by category"
        />
      )}

      {rows === null ? (
        <ul className={styles.list} aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className={`${styles.row} ${shimmerStyles.skeleton}`} />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>
          No climbers on the board yet. Be the first to log a send.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li
              key={r.user_id}
              className={`${styles.row} ${r.user_id === currentUserId ? styles.rowSelf : ""}`}
            >
              <span className={styles.rank}>#{r.rank}</span>
              <UserAvatar user={toAvatarUser(r)} size={40} />
              <div className={styles.rowText}>
                <span className={styles.rowName}>@{r.username}</span>
                {r.name && <span className={styles.rowSub}>{r.name}</span>}
              </div>
              <div className={styles.rowStats}>
                <span className={`${styles.statValue} ${styles.statPoints}`}>{r.points}</span>
                <span className={styles.statLabel}>pts</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
