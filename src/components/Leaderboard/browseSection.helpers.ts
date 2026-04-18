import type { LeaderboardEntry } from "@/lib/data";

/** Cache keyed by absolute offset (= rank − 1). */
export type RowCache = Record<number, LeaderboardEntry>;

/**
 * Top of the board: ranks 1-5 are rendered in the podium / main list,
 * so the browse window never starts below this offset.
 */
export const TOP_LIMIT = 5;

/** Number of rows shown in the browse window at once. */
export const BROWSE_WINDOW = 5;

/**
 * How far above + below the current window to prefetch. Each direction
 * gets one extra window-worth of rows ready so up / down nudges from
 * any cached state are instant.
 */
export const PREFETCH_BUFFER = BROWSE_WINDOW * 2;

/**
 * Seed a cache from a list of leaderboard entries with ranks.
 * Rows without a numeric rank (unranked user fallbacks) are skipped
 * since they don't correspond to any offset in the board.
 */
export function seedCache(rows: LeaderboardEntry[]): RowCache {
  const seeded: RowCache = {};
  for (const row of rows) {
    if (typeof row.rank === "number") {
      seeded[row.rank - 1] = row;
    }
  }
  return seeded;
}

/**
 * Find the first contiguous run of missing offsets in `[start, end)`.
 * Returns `null` when the whole range is cached. Callers use this to
 * fetch only what they need — the server returns contiguous rows so
 * one request fills the gap even if the range has internal holes
 * (the next render's pass picks up any remaining gaps).
 */
export function firstMissingRange(
  cache: RowCache,
  start: number,
  end: number,
): { start: number; count: number } | null {
  let runStart = -1;
  let runEnd = -1;
  for (let i = start; i < end; i++) {
    if (cache[i] === undefined) {
      if (runStart === -1) runStart = i;
      runEnd = i;
    } else if (runStart !== -1) {
      break;
    }
  }
  if (runStart === -1) return null;
  return { start: runStart, count: runEnd - runStart + 1 };
}

/**
 * Initial row-based offset for the browse window.
 *
 * - With server-fetched neighbourhood rows, anchor on the first row's
 *   rank so the window matches what the user already sees in the
 *   neighbourhood block.
 * - Without rows, centre on the user's rank (with a half-window
 *   bias so the user's row sits near the middle).
 * - Always clamped to >= TOP_LIMIT so the browse window never repeats
 *   ranks 1-5 from the podium / main list.
 */
export function computeInitialOffset(
  initialRows: LeaderboardEntry[],
  userRank: number,
): number {
  if (initialRows.length === 0) {
    return Math.max(TOP_LIMIT, userRank - Math.floor(BROWSE_WINDOW / 2) - 1);
  }
  const first = initialRows[0]?.rank;
  if (typeof first === "number") return Math.max(TOP_LIMIT, first - 1);
  return TOP_LIMIT;
}
