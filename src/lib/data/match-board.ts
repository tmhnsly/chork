/**
 * Which rows the live Match board shows before you expand it.
 *
 * The board used to be `leaderboard.slice(0, 5)` against a Match that
 * can hold twenty. If you were sixth you simply were not on it — a
 * leaderboard that cannot show you your own position, on the screen
 * you are staring at between attempts. Guests made it worse, because
 * a host can now seat players faster than anyone joins.
 *
 * So: the top of the board, and you, always. Same shape as the
 * Chorkboard's neighbourhood row.
 */

/** How many rows the collapsed board shows. */
export const BOARD_PREVIEW_SIZE = 5;

export interface VisibleBoard<T> {
  rows: T[];
  /** Rows not shown. Zero when expanded, or when everyone fits. */
  hiddenCount: number;
  /**
   * The viewer was pulled in from below the cut, so the preview jumps
   * ranks. The UI uses this to draw the break rather than silently
   * implying #4 and #9 are adjacent.
   */
  selfPinned: boolean;
}

/**
 * `rows` must already be in rank order.
 *
 * When the viewer falls below the cut, they replace the last preview
 * slot rather than extend it — the board keeps its height, which
 * matters on a phone where the grid below is what you actually tap.
 */
export function visibleBoardRows<T>(
  rows: T[],
  isSelf: (row: T) => boolean,
  expanded = false,
): VisibleBoard<T> {
  if (expanded || rows.length <= BOARD_PREVIEW_SIZE) {
    return { rows, hiddenCount: 0, selfPinned: false };
  }

  const preview = rows.slice(0, BOARD_PREVIEW_SIZE);
  const hiddenCount = rows.length - BOARD_PREVIEW_SIZE;

  if (preview.some(isSelf)) {
    return { rows: preview, hiddenCount, selfPinned: false };
  }

  const selfIndex = rows.findIndex(isSelf);
  // A spectator — nobody to pin. Guests are seats without an account,
  // so a host viewing their own Match always matches; this is the
  // path for someone who left, or an unusual read.
  if (selfIndex === -1) {
    return { rows: preview, hiddenCount, selfPinned: false };
  }

  return {
    rows: [...rows.slice(0, BOARD_PREVIEW_SIZE - 1), rows[selfIndex]],
    hiddenCount,
    selfPinned: true,
  };
}
