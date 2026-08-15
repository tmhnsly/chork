"use client";

import { useMemo } from "react";
import { FaBolt, FaFlag } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ClimberPeekHeader, SheetBody } from "@/components/ui";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { deriveTileState } from "@/lib/data/logs";
import { makeGradeLabeller } from "@/lib/data/grade-label";
import type {
  MatchLog,
  MatchPlayerView,
  MatchRoute,
  MatchGradingScale,
  MatchLeaderboardRow, } from "@/lib/data/match-types";
import { ownerIdOf } from "@/lib/data/match-types";
import { logKey } from "./matchScreenReducer";
import styles from "./matchPlayerGridSheet.module.scss";

interface Props {
  /** The player whose grid is being peeked. */
  player: MatchPlayerView;
  /** Their leaderboard row (rank/sends/flashes/zones/points). */
  row: MatchLeaderboardRow | undefined;
  routes: MatchRoute[];
  /** Every player's logs, keyed by `${userId}:${routeId}` per logKey. */
  logs: Map<string, MatchLog>;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: MatchGradingScale;
  /**
   * When set, each tile is tappable and opens the log sheet for this
   * player. Only passed for a GUEST viewed by the host, who is the
   * one person entering their sends.
   */
  onLogRoute?: (routeId: string) => void;
  onClose: () => void;
}

/**
 * Peek another player's send grid during a live match. Same chrome
 * pattern as the leaderboard's `<ClimberSheet>` — identity + stats
 * pin to the top via `ClimberPeekHeader`, only the grid scrolls —
 * so the two "peek another climber" surfaces feel like one design
 * language.
 *
 * Read-only: tile state derives from `state.logs` (sanitised for
 * non-self players in `MatchScreen.onLogChange`), and the grid doesn't
 * accept taps. To edit, climbers stay in their own grid.
 */
export function MatchPlayerGridSheet({
  player,
  row,
  routes,
  logs,
  grades,
  gradingScale,
  onLogRoute,
  onClose,
}: Props) {
  const labelForGrade = useMemo(
    () => makeGradeLabeller(gradingScale, grades),
    [gradingScale, grades],
  );

  const username = player.username ?? "unknown";
  const displayName = player.display_name?.trim() || username || "Climber";

  const header = ClimberPeekHeader({
    user: {
      id: player.user_id ?? player.player_id,
      username,
      name: player.display_name ?? "",
      avatar_url: player.avatar_url ?? "",
    },
    trailing: row ? (
      <span className={styles.rankChip} aria-label={`Rank ${row.rank}`}>
        #{row.rank}
      </span>
    ) : null,
    stats: row
      ? [
          { label: "Points", value: row.points },
          { label: "Sends", value: row.sends },
          { label: "Flashes", value: row.flashes, icon: <FaBolt />, tone: "flash" },
          { label: "Zones", value: row.zones, icon: <FaFlag />, tone: "success" },
        ]
      : [],
  });

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`@${username}'s match grid`}
      titleSlot={header.identity}
      subheader={row ? header.stats : undefined}
      description={`${displayName}'s send grid for this match`}
    >
      <SheetBody>
        <div className={styles.grid}>
          {routes.map((route) => {
            const log = logs.get(logKey(ownerIdOf(player), route.id)) ?? null;
            const state = deriveTileState(log);
            const gradeLabel = labelForGrade(route.declared_grade);
            return (
              <SendGridTile
                key={route.id}
                number={route.number}
                state={state}
                zone={route.has_zone && (log?.zone ?? false)}
                gradeLabel={gradeLabel ?? undefined}
                // Without a handler the tile renders as a plain div,
                // which is right for a read-only peek.
                onClick={onLogRoute ? () => onLogRoute(route.id) : undefined}
              />
            );
          })}
        </div>
      </SheetBody>
    </BottomSheet>
  );
}
