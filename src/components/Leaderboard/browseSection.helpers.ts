import type { LeaderboardEntry } from "@/lib/data";

/**
 * Top of the board: ranks 1-5 are rendered in the podium / main list,
 * so the browse window never starts below this offset.
 */
export const TOP_LIMIT = 5;

/**
 * Number of rows shown in the browse window at once. Up / Down move
 * the window by exactly this much.
 */
export const BROWSE_WINDOW = 5;

/**
 * Initial row-based offset for the browse window.
 *
 * - With server-fetched neighbourhood rows, anchor on the first row's
 *   rank so the window matches what the user already sees in the
 *   neighbourhood block.
 * - Without rows, centre on the user's rank (with a half-window
 *   bias so user's row sits near the middle).
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

/**
 * Offset for the previous browse window. Returns the current offset
 * unchanged when already at the top — the caller treats that as a
 * no-op (or disables the button).
 */
export function computePrevOffset(currentOffset: number): number {
  return Math.max(TOP_LIMIT, currentOffset - BROWSE_WINDOW);
}

/**
 * Offset for the next browse window. No upper clamp — the caller
 * detects bottom-of-board by counting returned rows < BROWSE_WINDOW.
 */
export function computeNextOffset(currentOffset: number): number {
  return currentOffset + BROWSE_WINDOW;
}

/**
 * "Back to you" jump: re-centres on the caller's rank using the same
 * formula as `computeInitialOffset`. Identity-checked against the
 * current offset by the caller to avoid a redundant fetch when the
 * user is already in view.
 */
export function computeReturnOffset(userRank: number): number {
  return Math.max(TOP_LIMIT, userRank - Math.floor(BROWSE_WINDOW / 2) - 1);
}
