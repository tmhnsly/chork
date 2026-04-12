"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { UserAvatar, shimmerStyles } from "@/components/ui";
import {
  getCrewLeaderboard,
  type Crew,
  type ActiveSetOption,
  type CrewLeaderboardRow,
} from "@/lib/data/crew-queries";
import { formatSetLabel } from "@/lib/data/set-label";
import styles from "./crewLeaderboardSection.module.scss";

interface Props {
  myCrews: Crew[];
  liveSets: ActiveSetOption[];
  selectedCrewId: string | null;
  onSelectCrew: (crewId: string | null) => void;
  selectedSetId: string | null;
  onSelectSet: (setId: string) => void;
  currentUserId: string;
  onCreateCrew: () => void;
}

export function CrewLeaderboardSection({
  myCrews,
  liveSets,
  selectedCrewId,
  onSelectCrew,
  selectedSetId,
  onSelectSet,
  currentUserId,
  onCreateCrew,
}: Props) {
  // Keyed cache — re-enters loading state on crew / set change without
  // a setState-in-effect lint warning.
  const [cache, setCache] = useState<{
    key: string;
    rows: CrewLeaderboardRow[];
  } | null>(null);

  const queryKey = `${selectedCrewId ?? ""}|${selectedSetId ?? ""}`;
  const rows = cache?.key === queryKey ? cache.rows : null;

  useEffect(() => {
    if (!selectedCrewId || !selectedSetId) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const data = await getCrewLeaderboard(supabase, selectedCrewId, selectedSetId);
      if (!cancelled) setCache({ key: queryKey, rows: data });
    })();
    return () => { cancelled = true; };
  }, [selectedCrewId, selectedSetId, queryKey]);

  return (
    <section className={styles.section} aria-labelledby="crew-leaderboard-heading">
      <h2 id="crew-leaderboard-heading" className={styles.heading}>Leaderboard</h2>

      {/* Crew pill picker — horizontal scroll on narrow screens */}
      <div className={styles.pillRow} role="tablist" aria-label="Pick a crew">
        {myCrews.map((crew) => (
          <button
            key={crew.id}
            type="button"
            role="tab"
            aria-selected={selectedCrewId === crew.id}
            className={`${styles.pill} ${selectedCrewId === crew.id ? styles.pillActive : ""}`}
            onClick={() => onSelectCrew(crew.id)}
          >
            {crew.name}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.pill} ${styles.pillCreate}`}
          onClick={onCreateCrew}
        >
          <FaPlus aria-hidden /> New crew
        </button>
      </div>

      {selectedCrewId ? (
        <>
          {/* Set picker — dropdown over all live sets */}
          <label className={styles.setPicker}>
            <span className={styles.setPickerLabel}>Ranking on</span>
            <select
              className={styles.setSelect}
              value={selectedSetId ?? ""}
              onChange={(e) => onSelectSet(e.target.value)}
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
            <p className={styles.empty}>No one in this crew yet. Invite some mates.</p>
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
        </>
      ) : (
        <p className={styles.empty}>
          You aren&apos;t in any crews yet. Create one to start a private leaderboard with your mates.
        </p>
      )}
    </section>
  );
}
