import type { LeaderboardEntry, NeighbourhoodEntry } from "@/lib/data";

/**
 * Cache keyed by absolute offset into the board — the same `p_offset`
 * the paging RPCs take. Deliberately NOT `rank - 1`: `dense_rank()`
 * gives tied climbers a shared rank, so rank is a label, not a
 * position, and the two drift apart from the first tie onward.
 */
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
 * Seed a cache from the server-fetched neighbourhood rows.
 *
 * Keyed on `board_position`, which the RPC computes as a `row_number`
 * over the board's real ordering (migration 074). This used to key on
 * `rank - 1`, which is only the same thing while every rank is unique:
 * once two climbers tie they share a rank, every row below them sits
 * one offset lower than its rank suggests, and the seeded rows land on
 * offsets that `fetchRange` then fills with *different* rows. The same
 * climber ended up cached at two offsets and the window rendered them
 * twice.
 *
 * Rows without a numeric position are skipped — they don't correspond
 * to any offset in the board.
 */
export function seedCache(rows: NeighbourhoodEntry[]): RowCache {
  const seeded: RowCache = {};
  for (const row of rows) {
    if (typeof row.board_position === "number") {
      seeded[row.board_position] = row;
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
  initialRows: NeighbourhoodEntry[],
  userRank: number,
): number {
  if (initialRows.length === 0) {
    // No neighbourhood to anchor on. `userRank` is the only signal
    // left and it over-estimates the offset once the board has ties,
    // so this is a best guess — but BrowseSection only renders when
    // the neighbourhood came back non-empty, so it's unreachable in
    // practice. Kept as a safe fallback rather than a throw.
    return Math.max(TOP_LIMIT, userRank - Math.floor(BROWSE_WINDOW / 2) - 1);
  }
  const first = initialRows[0]?.board_position;
  if (typeof first === "number") return Math.max(TOP_LIMIT, first);
  return TOP_LIMIT;
}
