"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaBolt, FaFlag, FaUser } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, UserAvatar, shimmerStyles } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import type { LeaderboardEntry, Route, TileState } from "@/lib/data";
import { formatGrade } from "@/lib/data/grade-label";
import { fetchClimberSheetLogs, type SanitisedLog } from "@/app/leaderboard/actions";
import { toAvatarUser } from "./helpers";
import styles from "./climberSheet.module.scss";

/** Derive tile state from the sanitised log (no raw attempts leaked). */
function tileStateFromSanitised(log: SanitisedLog | undefined): TileState {
  if (!log || !log.has_attempts) return "empty";
  if (!log.completed) return "attempted";
  if (log.is_flash) return "flash";
  return "completed";
}

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
  const [logs, setLogs] = useState<SanitisedLog[] | null>(null);
  const [loading, setLoading] = useState(setId !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) return;
    let cancelled = false;
    fetchClimberSheetLogs(entry.user_id, setId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setLogs(result.logs);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [entry.user_id, setId]);

  const logByRoute = logs ? new Map(logs.map((l) => [l.route_id, l])) : null;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Current Set"
      description={`Climber stats for @${entry.username}`}
    >
      <div className={styles.body}>
        {/* Identity */}
        <header className={styles.header}>
          <UserAvatar user={toAvatarUser(entry)} size={72} />
          <div className={styles.identity}>
            <span className={styles.username}>@{entry.username}</span>
            {entry.name && <span className={styles.name}>{entry.name}</span>}
          </div>
          <span className={styles.rankBadge} aria-label={`Rank ${entry.rank ?? "unranked"}`}>
            {entry.rank === null ? "—" : `#${entry.rank}`}
          </span>
        </header>

        {/* Stats */}
        <section className={styles.stats} aria-label="Climbing stats">
          <Stat label="Points" value={entry.points} />
          <Stat label="Sends" value={entry.sends} />
          <Stat label="Flashes" value={entry.flashes} icon={<FaBolt />} variant="flash" />
          <Stat label="Zones" value={entry.zones} icon={<FaFlag />} variant="success" />
        </section>

        {/* Send grid (current set only) */}
        {setId && routes.length > 0 && (
          <section className={styles.gridSection} aria-label="Send grid for current set">
            <div
              className={styles.grid}
              role={loading ? "status" : undefined}
              aria-busy={loading || undefined}
              aria-label={loading ? "Loading send grid" : undefined}
            >
              {routes.map((route) => {
                const log = logByRoute?.get(route.id);
                return (
                  <PunchTile
                    key={route.id}
                    number={route.number}
                    state={tileStateFromSanitised(log)}
                    zone={log?.zone}
                    gradeLabel={log?.grade_vote != null ? (formatGrade(log.grade_vote, "v") ?? undefined) : undefined}
                    className={loading ? shimmerStyles.skeleton : undefined}
                  />
                );
              })}
            </div>
            {!loading && error && (
              <p className={styles.empty}>Couldn&apos;t load send grid. {error}</p>
            )}
          </section>
        )}
        {setId && routes.length === 0 && (
          <p className={styles.empty}>No routes in the current set yet.</p>
        )}

        <Link href={`/u/${entry.username}`} className={styles.profileLink}>
          <Button fullWidth>
            <FaUser aria-hidden="true" /> View full profile
          </Button>
        </Link>
      </div>
    </BottomSheet>
  );
}

interface StatProps {
  label: string;
  value: number;
  icon?: React.ReactNode;
  variant?: "flash" | "success";
}

function Stat({ label, value, icon, variant }: StatProps) {
  const cls = [styles.stat, variant ? styles[`stat--${variant}`] : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className={styles.statValue}>
        {icon && <span className={styles.statIcon} aria-hidden="true">{icon}</span>}
        {value}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
