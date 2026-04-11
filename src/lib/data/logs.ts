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

/** Derive tile visual state from a route log. */
export function deriveTileState(log: RouteLog | undefined): TileState {
  if (!log || log.attempts === 0) return "empty";
  if (!log.completed) return "attempted";
  if (isFlash(log)) return "flash";
  return "completed";
}
