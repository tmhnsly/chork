"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FaBolt, FaFlag, FaUser } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, SheetBody, UserAvatar } from "@/components/ui";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
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

// ── Client-side cache ─────────────────────────────
// Opening the same climber's sheet twice in a row shouldn't fire
// two network requests. 30s TTL catches the common "tap to peek,
// close, tap again" flow without serving stale data during a busy
// session where climbers are logging sends.
interface CacheEntry {
  logs: SanitisedLog[];
  at: number;
}
const CLIMBER_SHEET_TTL = 30_000;
const climberSheetCache = new Map<string, CacheEntry>();

function cacheKey(userId: string, setId: string): string {
  return `${userId}:${setId}`;
}

function readCache(userId: string, setId: string): SanitisedLog[] | null {
  const entry = climberSheetCache.get(cacheKey(userId, setId));
  if (!entry) return null;
  if (Date.now() - entry.at > CLIMBER_SHEET_TTL) {
    climberSheetCache.delete(cacheKey(userId, setId));
    return null;
  }
  return entry.logs;
}

function writeCache(userId: string, setId: string, logs: SanitisedLog[]): void {
  climberSheetCache.set(cacheKey(userId, setId), { logs, at: Date.now() });
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
  // Seed from cache synchronously so a re-open inside the TTL shows
  // the grid instantly with no loading shimmer.
  const cached = setId ? readCache(entry.user_id, setId) : null;
  const [logs, setLogs] = useState<SanitisedLog[] | null>(cached);
  const [loading, setLoading] = useState(setId !== null && cached === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) return;
    if (readCache(entry.user_id, setId)) return; // fresh cache hit, skip fetch
    let cancelled = false;
    fetchClimberSheetLogs(entry.user_id, setId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }
      writeCache(entry.user_id, setId, result.logs);
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
      title={setId ? "Current Set" : "All Time"}
      description={`Climber stats for @${entry.username}`}
    >
      <SheetBody gap={5}>
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
              {loading
                ? routes.map((route) => (
                    <div key={route.id} className={styles.loadingTile} aria-hidden />
                  ))
                : routes.map((route) => {
                    const log = logByRoute?.get(route.id);
                    return (
                      <SendGridTile
                        key={route.id}
                        number={route.number}
                        state={tileStateFromSanitised(log)}
                        zone={log?.zone}
                        gradeLabel={log?.grade_vote != null ? (formatGrade(log.grade_vote, "v") ?? undefined) : undefined}
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
      </SheetBody>
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
