"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { UserAvatar, shimmerStyles } from "@/components/ui";
import {
  getCrewLeaderboard,
  type ActiveSetOption,
  type CrewLeaderboardRow,
} from "@/lib/data/crew-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import styles from "./crewLeaderboardSection.module.scss";

interface Props {
  crewId: string;
  /** Live sets across all gyms — the picker ranks within any of them. */
  liveSets: ActiveSetOption[];
  /** Initially-selected set. Falls back to the first live set. */
  initialSetId: string | null;
  currentUserId: string;
}

/**
 * Single-crew leaderboard panel. Used on the crew detail page where
 * the crew is already fixed — only the set pickers remain. Skeleton
 * shows on first load and on every set change.
 */
export function CrewLeaderboardPanel({
  crewId,
  liveSets,
  initialSetId,
  currentUserId,
}: Props) {
  const [selectedSetId, setSelectedSetId] = useState<string | null>(
    initialSetId ?? liveSets[0]?.set_id ?? null,
  );

  // Keyed cache — re-enters loading state on set change without
  // tripping `set-state-in-effect`.
  const [cache, setCache] = useState<{
    key: string;
    rows: CrewLeaderboardRow[];
  } | null>(null);

  const queryKey = `${crewId}|${selectedSetId ?? ""}`;
  const rows = cache?.key === queryKey ? cache.rows : null;

  useEffect(() => {
    if (!selectedSetId) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const data = await getCrewLeaderboard(supabase, crewId, selectedSetId);
      if (!cancelled) setCache({ key: queryKey, rows: data });
    })();
    return () => { cancelled = true; };
  }, [crewId, selectedSetId, queryKey]);

  return (
    <section className={styles.section} aria-label="Crew leaderboard">
      <label className={styles.setPicker}>
        <span className={styles.setPickerLabel}>Ranking on</span>
        <select
          className={styles.setSelect}
          value={selectedSetId ?? ""}
          onChange={(e) => setSelectedSetId(e.target.value)}
        >
          {liveSets.length === 0 && <option value="">No live sets</option>}
          {liveSets.map((s) => (
            <option key={s.set_id} value={s.set_id}>
              {s.gym_name} · {formatSetLabel({
                name: s.set_name,
                starts_at: s.set_starts_at,
                ends_at: s.set_ends_at,
              })}
            </option>
          ))}
        </select>
      </label>

      {rows === null ? (
        <ul className={styles.list} aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className={`${styles.row} ${shimmerStyles.skeleton}`} />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>
          No activity on this set yet. Get climbing.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => {
            const isSelf = r.user_id === currentUserId;
            return (
              <li
                key={r.user_id}
                className={`${styles.row} ${isSelf ? styles.rowSelf : ""}`}
              >
                <Link
                  href={`/u/${r.username}`}
                  className={styles.rowLink}
                  aria-label={`Open @${r.username}'s profile`}
                >
                  <span className={styles.rank}>
                    {r.rank === null ? "—" : `#${r.rank}`}
                  </span>
                  <UserAvatar
                    user={{
                      id: r.user_id,
                      username: r.username,
                      name: r.name,
                      avatar_url: r.avatar_url,
                    }}
                    size={40}
                  />
                  <div className={styles.rowText}>
                    <span className={styles.rowName}>@{r.username}</span>
                    {r.name && <span className={styles.rowSub}>{r.name}</span>}
                  </div>
                  <div className={styles.rowStats}>
                    <span className={styles.statValue}>{r.points}</span>
                    <span className={styles.statLabel}>pts</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
