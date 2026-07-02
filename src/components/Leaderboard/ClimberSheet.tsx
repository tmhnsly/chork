"use client";

import { FaBolt, FaFlag } from "react-icons/fa6";
import { createResourceCache, useClientResource } from "@/hooks/use-client-resource";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  ClimberPeekHeader,
  SheetBody,
  shimmerStyles,
} from "@/components/ui";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import type { LeaderboardEntry, Route, TileState } from "@/lib/data";
import { formatGrade } from "@/lib/data/grade-label";
import { fetchClimberSheetLogs, type SanitisedLog } from "@/app/leaderboard/actions";
import { toAvatarUser } from "@/lib/data/leaderboard-helpers";
import styles from "./climberSheet.module.scss";

/** Derive tile state from the sanitised log (no raw attempts leaked). */
function tileStateFromSanitised(log: SanitisedLog | undefined): TileState {
  if (!log || !log.has_attempts) return "empty";
  if (!log.completed) return "attempted";
  if (log.is_flash) return "flash";
  return "completed";
}

// ── Client-side cache ─────────────────────────────
// Opening the same climber's sheet twice in a row shouldn't fire
// two network requests. 30s TTL catches the common "tap to peek,
// close, tap again" flow without serving stale data during a busy
// session where climbers are logging sends. The hook seeds from
// this module-level cache synchronously on mount, so a re-open
// inside the TTL shows the grid instantly with no loading shimmer.
const climberSheetCache = createResourceCache<SanitisedLog[]>({ ttlMs: 30_000 });

interface Props {
  entry: LeaderboardEntry;
  /** Active set id (only provided when on "This set" tab). */
  setId: string | null;
  /** Routes for the active set — preloaded by the leaderboard page so
   *  the grid can render its real shape instantly while logs load. */
  routes: Route[];
  onClose: () => void;
}

export function ClimberSheet({ entry, setId, routes, onClose }: Props) {
  const { data: logs, loading, error } = useClientResource<SanitisedLog[]>(
    `${entry.user_id}:${setId ?? ""}`,
    async () => {
      // `enabled` guards the null case — setId is always set here.
      const result = await fetchClimberSheetLogs(entry.user_id, setId!);
      if ("error" in result) throw new Error(result.error);
      return result.logs;
    },
    { enabled: setId !== null, cache: climberSheetCache },
  );
  const errorMessage =
    error == null ? null : error instanceof Error ? error.message : String(error);

  const logByRoute = logs ? new Map(logs.map((l) => [l.route_id, l])) : null;

  const header = ClimberPeekHeader({
    user: toAvatarUser(entry),
    trailing: (
      <span
        className={styles.rankBadge}
        aria-label={`Rank ${entry.rank ?? "unranked"}`}
      >
        {entry.rank === null ? "—" : `#${entry.rank}`}
      </span>
    ),
    stats: [
      { label: "Points", value: entry.points },
      { label: "Sends", value: entry.sends },
      { label: "Flashes", value: entry.flashes, icon: <FaBolt />, tone: "flash" },
      { label: "Zones", value: entry.zones, icon: <FaFlag />, tone: "success" },
    ],
  });

  return (
    <BottomSheet
      open
      onClose={onClose}
      // Accessible title — visually hidden because `titleSlot` takes
      // over the chrome with the rich identity row. AT still hears
      // something meaningful when the sheet opens.
      title={`@${entry.username}'s ${setId ? "current set" : "all-time"} stats`}
      titleSlot={header.identity}
      subheader={header.stats}
    >
      <SheetBody>
        {setId && routes.length > 0 && (
          <div
            className={styles.grid}
            role={loading ? "status" : undefined}
            aria-busy={loading || undefined}
            aria-label={loading ? "Loading send grid" : "Send grid for current set"}
          >
            {routes.map((route) => {
              if (loading) {
                return (
                  <div
                    key={route.id}
                    className={`${styles.skeletonTile} ${shimmerStyles.skeleton}`}
                    aria-hidden
                  />
                );
              }
              const log = logByRoute?.get(route.id);
              return (
                <SendGridTile
                  key={route.id}
                  number={route.number}
                  state={tileStateFromSanitised(log)}
                  zone={log?.zone}
                  gradeLabel={
                    log?.grade_vote != null
                      ? (formatGrade(log.grade_vote, "v") ?? undefined)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
        {!loading && errorMessage && (
          <p className={styles.empty}>
            Couldn&apos;t load send grid. {errorMessage}
          </p>
        )}
        {setId && routes.length === 0 && (
          <p className={styles.empty}>No routes in the current set yet.</p>
        )}
        {!setId && (
          <p className={styles.empty}>
            All-time stats above. Tap the avatar to see the full profile.
          </p>
        )}
      </SheetBody>
    </BottomSheet>
  );
}
