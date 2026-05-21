"use client";

import { useMemo } from "react";
import { FaBolt, FaFlag } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ClimberPeekHeader, SheetBody } from "@/components/ui";
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
 * Peek another player's send grid during a live jam. Same chrome
 * pattern as the leaderboard's `<ClimberSheet>` — identity + stats
 * pin to the top via `ClimberPeekHeader`, only the grid scrolls —
 * so the two "peek another climber" surfaces feel like one design
 * language.
 *
 * Read-only: tile state derives from `state.logs` (sanitised for
 * non-self players in `JamScreen.onLogChange`), and the grid doesn't
 * accept taps. To edit, climbers stay in their own grid.
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

  const username = player.username ?? "unknown";
  const displayName = player.display_name?.trim() || username || "Climber";

  const header = ClimberPeekHeader({
    user: {
      id: player.user_id,
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
      title={`@${username}'s jam grid`}
      titleSlot={header.identity}
      subheader={row ? header.stats : undefined}
      description={`${displayName}'s send grid for this jam`}
    >
      <SheetBody>
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
