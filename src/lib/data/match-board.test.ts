import { describe, it, expect } from "vitest";
import { visibleBoardRows, BOARD_PREVIEW_SIZE } from "./match-board";

interface Row {
  id: string;
  self?: boolean;
}

const isSelf = (r: Row) => r.self === true;

/** `n` rows in rank order; `selfAt` is a 1-based rank, or none. */
function board(n: number, selfAt?: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    self: selfAt === i + 1,
  }));
}

describe("visibleBoardRows", () => {
  it("shows everyone when they fit", () => {
    const rows = board(BOARD_PREVIEW_SIZE);
    const out = visibleBoardRows(rows, isSelf);
    expect(out.rows).toHaveLength(BOARD_PREVIEW_SIZE);
    expect(out.hiddenCount).toBe(0);
    expect(out.selfPinned).toBe(false);
  });

  it("caps at the preview size and counts the rest", () => {
    const out = visibleBoardRows(board(20, 1), isSelf);
    expect(out.rows).toHaveLength(BOARD_PREVIEW_SIZE);
    expect(out.hiddenCount).toBe(20 - BOARD_PREVIEW_SIZE);
  });

  it("leaves the preview alone when the viewer is already in it", () => {
    const out = visibleBoardRows(board(20, 3), isSelf);
    expect(out.rows.map((r) => r.id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(out.selfPinned).toBe(false);
  });

  it("pins the viewer when they fall below the cut", () => {
    // The bug this exists for: rank 9 of 20 used to see no row of
    // their own at all.
    const out = visibleBoardRows(board(20, 9), isSelf);
    expect(out.rows.map((r) => r.id)).toEqual(["p1", "p2", "p3", "p4", "p9"]);
    expect(out.selfPinned).toBe(true);
    expect(out.rows.some(isSelf)).toBe(true);
  });

  it("keeps the board the same height when it pins", () => {
    // On a phone the grid below the board is what you tap; a board
    // that grows by a row when you slip to 6th pushes it down.
    const inPreview = visibleBoardRows(board(20, 2), isSelf);
    const pinned = visibleBoardRows(board(20, 12), isSelf);
    expect(pinned.rows).toHaveLength(inPreview.rows.length);
  });

  it("returns everything when expanded", () => {
    const out = visibleBoardRows(board(20, 9), isSelf, true);
    expect(out.rows).toHaveLength(20);
    expect(out.hiddenCount).toBe(0);
    expect(out.selfPinned).toBe(false);
  });

  it("handles a viewer who isn't on the board", () => {
    // Someone reading a Match they left, before the roster catches up.
    const out = visibleBoardRows(board(20), isSelf);
    expect(out.rows).toHaveLength(BOARD_PREVIEW_SIZE);
    expect(out.selfPinned).toBe(false);
  });

  it("never drops the viewer from an expanded board", () => {
    for (const rank of [1, 5, 6, 13, 20]) {
      const out = visibleBoardRows(board(20, rank), isSelf, true);
      expect(out.rows.some(isSelf)).toBe(true);
    }
  });

  it("never shows the viewer twice", () => {
    for (const rank of [1, 4, 5, 6, 20]) {
      const out = visibleBoardRows(board(20, rank), isSelf);
      expect(out.rows.filter(isSelf)).toHaveLength(
        rank <= BOARD_PREVIEW_SIZE ? 1 : 1,
      );
      expect(new Set(out.rows.map((r) => r.id)).size).toBe(out.rows.length);
    }
  });
});
