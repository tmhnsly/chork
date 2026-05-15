"use client";

import { useMemo } from "react";
import { FaBolt, FaFlag } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SheetBody, UserAvatar } from "@/components/ui";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { deriveTileState } from "@/lib/data/logs";
import { formatGrade } from "@/lib/data/grade-label";
import type {
  JamLog,
  JamPlayerView,
  JamRoute,
  JamGradingScale,
  JamLeaderboardRow,
} from "@/lib/data/jam-types";
import { logKey } from "./jamScreenReducer";
import styles from "./jamPlayerGridSheet.module.scss";

interface Props {
  /** The player whose grid is being peeked. */
  player: JamPlayerView;
  /** Their leaderboard row (rank/sends/flashes/zones/points). */
  row: JamLeaderboardRow | undefined;
  routes: JamRoute[];
  /** Every player's logs, keyed by `${userId}:${routeId}` per logKey. */
  logs: Map<string, JamLog>;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: JamGradingScale;
  onClose: () => void;
}

/**
 * Peek another player's send grid during a live jam. The tile state
 * is derived from the same `state.logs` Map the host's own grid uses —
 * the only difference is which user_id we look up per route. Logs for
 * non-self players have already been sanitised by JamScreen's
 * `onLogChange` (`visibleAttempts(log, false)`), so:
 *   - flash (attempts=1 + completed)  → "flash" tile
 *   - non-flash completion             → "completed" tile
 *   - in-progress (attempts>0, !completed) → "empty" tile (privacy)
 *   - zone status                      → passes through (public)
 *
 * Read-only — no log sheet hooked up; you can only edit your own.
 */
export function JamPlayerGridSheet({
  player,
  row,
  routes,
  logs,
  grades,
  gradingScale,
  onClose,
}: Props) {
  const gradeLabelByOrdinal = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of grades) map.set(g.ordinal, g.label);
    return map;
  }, [grades]);

  const displayName = player.display_name?.trim() || player.username || "Climber";
  const username = player.username ?? "unknown";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`@${username}`}
      description={`${displayName}'s send grid for this jam`}
    >
      <SheetBody gap={4}>
        <header className={styles.header}>
          <UserAvatar
            user={{
              id: player.user_id,
              username,
              name: player.display_name ?? "",
              avatar_url: player.avatar_url ?? "",
            }}
            size={56}
          />
          <div className={styles.headerText}>
            <span className={styles.displayName}>{displayName}</span>
            <span className={styles.handle}>@{username}</span>
          </div>
          {row ? (
            <div className={styles.rankPoints} aria-label="Standing">
              <span className={styles.rank}>
                {row.rank === 1 ? "1st" : row.rank === 2 ? "2nd" : row.rank === 3 ? "3rd" : `${row.rank}th`}
              </span>
              <span className={styles.points}>{row.points} pts</span>
            </div>
          ) : null}
        </header>

        {row ? (
          <ul className={styles.statsRow} aria-label="Jam stats">
            <li className={styles.statCell}>
              <span className={styles.statValue}>{row.sends}</span>
              <span className={styles.statLabel}>Sends</span>
            </li>
            <li className={styles.statCell}>
              <span className={`${styles.statValue} ${styles.flash}`}>
                <FaBolt aria-hidden /> {row.flashes}
              </span>
              <span className={styles.statLabel}>Flashes</span>
            </li>
            <li className={styles.statCell}>
              <span className={`${styles.statValue} ${styles.zone}`}>
                <FaFlag aria-hidden /> {row.zones}
              </span>
              <span className={styles.statLabel}>Zones</span>
            </li>
          </ul>
        ) : null}

        <div className={styles.grid}>
          {routes.map((route) => {
            const log = logs.get(logKey(player.user_id, route.id)) ?? null;
            const state = deriveTileState(log);
            const gradeLabel =
              route.grade !== null && route.grade !== undefined
                ? gradingScale === "custom"
                  ? gradeLabelByOrdinal.get(route.grade)
                  : formatGrade(route.grade, gradingScale) ?? undefined
                : undefined;
            return (
              <SendGridTile
                key={route.id}
                number={route.number}
                state={state}
                zone={route.has_zone && (log?.zone ?? false)}
                gradeLabel={gradeLabel ?? undefined}
              />
            );
          })}
        </div>
      </SheetBody>
    </BottomSheet>
  );
}
