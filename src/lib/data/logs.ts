import type { RouteLog } from "./types";

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

/**
 * Compute community grade from an array of grade votes.
 * Returns the mean rounded to nearest integer, or null if empty.
 */
export function computeRouteGrade(gradeVotes: number[]): number | null {
  if (gradeVotes.length === 0) return null;
  const sum = gradeVotes.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / gradeVotes.length);
}
