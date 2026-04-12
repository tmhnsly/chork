/**
 * Pure stat derivations for the profile page.
 * All functions handle zero inputs gracefully — percentages / averages
 * return `null` when the denominator is zero so the UI can render "—".
 */

import type { RouteLog } from "./types";

export interface AllTimeAggregates {
  sends: number;
  flashes: number;
  points: number;
  /** Sum of attempts across completed routes only. */
  totalAttempts: number;
  /** Unique routes with at least one logged attempt. */
  uniqueRoutesAttempted: number;
}

type LogForAggregates = Pick<RouteLog, "route_id" | "attempts" | "completed" | "zone">;

/** Aggregate per-log data into the all-time stat bundle. */
export function computeAllTimeAggregates(logs: LogForAggregates[]): AllTimeAggregates {
  let sends = 0;
  let flashes = 0;
  let points = 0;
  let totalAttempts = 0;
  const attemptedRouteIds = new Set<string>();

  for (const log of logs) {
    if (log.attempts > 0) attemptedRouteIds.add(log.route_id);
    if (!log.completed) continue;

    sends += 1;
    totalAttempts += log.attempts;
    if (log.attempts === 1) flashes += 1;

    // Points inlined to avoid importing logs.ts in case of cycles;
    // mirrors computePoints() — kept in sync.
    if (log.attempts === 1) points += 4;
    else if (log.attempts === 2) points += 3;
    else if (log.attempts === 3) points += 2;
    else points += 1;
    if (log.zone) points += 1;
  }

  return {
    sends,
    flashes,
    points,
    totalAttempts,
    uniqueRoutesAttempted: attemptedRouteIds.size,
  };
}

/** Flash rate as a 0–1 fraction (flashes ÷ sends). Null when sends is 0. */
export function flashRate(sends: number, flashes: number): number | null {
  if (sends === 0) return null;
  return flashes / sends;
}

/** Average points per send (rounded to 1dp). Null when sends is 0. */
export function pointsPerSend(points: number, sends: number): number | null {
  if (sends === 0) return null;
  return Math.round((points / sends) * 10) / 10;
}

/** Completion rate = sends ÷ unique routes attempted. Null when none attempted. */
export function completionRate(sends: number, uniqueRoutesAttempted: number): number | null {
  if (uniqueRoutesAttempted === 0) return null;
  return sends / uniqueRoutesAttempted;
}

/** Route coverage = attempted ÷ total available. Null when no routes exist. */
export function routeCoverage(
  uniqueRoutesAttempted: number,
  totalRoutesInGym: number
): number | null {
  if (totalRoutesInGym === 0) return null;
  return uniqueRoutesAttempted / totalRoutesInGym;
}

/**
 * Consecutive-set streak from a list of set summaries.
 *
 * @param sets — ordered newest-first. `hasSend` indicates ≥1 completion in that set.
 * @returns current streak (count from most recent until the first set without a send)
 *          and best streak (longest run anywhere in the history).
 */
export function computeSetStreak(
  sets: Array<{ hasSend: boolean }>
): { current: number; best: number } {
  let current = 0;
  for (const s of sets) {
    if (s.hasSend) current += 1;
    else break;
  }

  let best = 0;
  let run = 0;
  for (const s of sets) {
    if (s.hasSend) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  return { current, best };
}
