import type { RouteLog, TileState } from "./types";

/** A route is a flash when completed on the first attempt. */
export function isFlash(log: Pick<RouteLog, "attempts" | "completed">): boolean {
  return log.attempts === 1 && log.completed === true;
}

/**
 * Compute points for a route log.
 * flash=4, 2 attempts=3, 3 attempts=2, 4+=1, incomplete=0
 * Zone bonus: +1 independent of completion.
 */
export function computePoints(log: Pick<RouteLog, "attempts" | "completed" | "zone">): number {
  let pts = 0;
  if (log.completed) {
    if (log.attempts === 1) pts = 4;
    else if (log.attempts === 2) pts = 3;
    else if (log.attempts === 3) pts = 2;
    else pts = 1;
  }
  if (log.zone) pts += 1;
  return pts;
}

// Points constants - used internally by computeMaxPoints
const POINTS_PER_FLASH = 4;
const POINTS_PER_ZONE = 1;

/**
 * Compute the maximum possible points for a set of routes.
 * Assumes every route is flashed and every zone hold is claimed.
 */
export function computeMaxPoints(totalRoutes: number, zoneRouteCount: number): number {
  return totalRoutes * POINTS_PER_FLASH + zoneRouteCount * POINTS_PER_ZONE;
}

/**
 * Derive tile visual state from a log row. Structural on
 * `attempts` + `completed` so it works for both `route_logs` (gym)
 * and `jam_logs` (ephemeral jams) — the tile visual language is
 * shared.
 */
export function deriveTileState(
  log: Pick<RouteLog, "attempts" | "completed"> | null | undefined
): TileState {
  if (!log || log.attempts === 0) return "empty";
  if (!log.completed) return "attempted";
  if (isFlash(log)) return "flash";
  return "completed";
}

/**
 * Privacy contract: raw attempt counts are owner-only. When rendering
 * a log on another climber's profile, we collapse `attempts` to one of
 * three buckets so downstream consumers (RouteChart bar heights,
 * computePoints math) still distinguish flash from non-flash while
 * leaking nothing about how many tries it took:
 *
 *   - Flash (attempts === 1 && completed)   → 1   (full-height bar, 4 pts)
 *   - Non-flash completion                  → 2   (uniform shorter bar, 3 pts)
 *   - Uncompleted (regardless of tries)     → 0   (no "in progress" signal)
 *
 * Zone status is public (contributes to public leaderboard) and is
 * not touched here — pass it through unchanged.
 *
 * Always thread through `isOwnProfile` from the page boundary; the
 * helper itself is the single source of truth for this rule so adding
 * a new caller can't quietly skip it.
 */
export function visibleAttempts(
  log: Pick<RouteLog, "attempts" | "completed">,
  isOwnProfile: boolean,
): number {
  if (isOwnProfile) return log.attempts;
  if (!log.completed) return 0;
  return log.attempts === 1 ? 1 : 2;
}
