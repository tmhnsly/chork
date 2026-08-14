"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useClientResource } from "@/hooks/use-client-resource";
import { getCompetitionLeaderboard, type CompetitionLeaderboardRow } from "@/lib/data/competition-queries";
import {
  Button,
  LeaderboardRow,
  shimmerStyles,
  TabPills,
  type LeaderboardRowData,
  type TabPillOption,
} from "@/components/ui";
import type { CompetitionCategory } from "@/lib/data/competition-queries";
import styles from "./competitionLeaderboard.module.scss";

/** Adapter — the shared `LeaderboardRow` primitive is decoupled from
 *  the competition query shape (same idiom as `LeaderboardList`). */
function toRowData(r: CompetitionLeaderboardRow): LeaderboardRowData {
  return {
    userId: r.user_id,
    username: r.username,
    name: r.name,
    avatarUrl: r.avatar_url,
    rank: r.rank,
    points: r.points,
    flashes: r.flashes,
  };
}

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
  const { data: rows, error, reload } = useClientResource<CompetitionLeaderboardRow[]>(
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

      {error ? (
        <div className={styles.empty}>
          Couldn&apos;t load the leaderboard.{" "}
          <Button variant="ghost" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : rows === null ? (
        <ul className={styles.list} aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className={`${styles.skeletonRow} ${shimmerStyles.skeleton}`}
            />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>
          No climbers on the board yet. Be the first to log a send.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={r.user_id}>
              <LeaderboardRow
                entry={toRowData(r)}
                highlighted={r.user_id === currentUserId}
                interactive={false}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
