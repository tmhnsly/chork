import { describe, it, expect } from "vitest";
import {
  TOP_LIMIT,
  computeInitialOffset,
  firstMissingRange,
  seedCache,
  type RowCache,
} from "./browseSection.helpers";
import type { NeighbourhoodEntry } from "@/lib/data";

/**
 * `board_position` defaults to `rank - 1` because that IS the truth on
 * a board with no ties. The tie cases below pass it explicitly, which
 * is the whole point: the two only diverge once ranks repeat.
 */
const stubRow = (
  rank: number,
  board_position = rank - 1,
): NeighbourhoodEntry => ({
  user_id: `u${rank}-${board_position}`,
  username: `u${rank}-${board_position}`,
  name: `U ${rank}`,
  avatar_url: "",
  rank,
  sends: 0,
  flashes: 0,
  zones: 0,
  points: 0,
  board_position,
});

describe("computeInitialOffset", () => {
  it("anchors on the first neighbourhood row's board position", () => {
    const rows = [stubRow(8), stubRow(9), stubRow(10), stubRow(11), stubRow(12)];
    // First row sits at board_position 7
    expect(computeInitialOffset(rows, 10)).toBe(7);
  });

  it("clamps to TOP_LIMIT when neighbourhood would overlap the top", () => {
    const rows = [stubRow(4), stubRow(5), stubRow(6), stubRow(7), stubRow(8)];
    // First row rank 4 → would be offset 3, clamped to TOP_LIMIT (5)
    expect(computeInitialOffset(rows, 6)).toBe(TOP_LIMIT);
  });

  it("centres on userRank when neighbourhood rows are empty", () => {
    // userRank 10 with WINDOW 5 → centre offset = 10 - 2 - 1 = 7
    expect(computeInitialOffset([], 10)).toBe(7);
  });

  it("clamps the centred-on-user fallback to TOP_LIMIT", () => {
    // userRank 6 → would be offset 3, clamped to TOP_LIMIT
    expect(computeInitialOffset([], 6)).toBe(TOP_LIMIT);
  });

  it("falls back to TOP_LIMIT when the first row has no board position", () => {
    const rows = [
      { ...stubRow(8), board_position: undefined } as unknown as NeighbourhoodEntry,
    ];
    expect(computeInitialOffset(rows, 8)).toBe(TOP_LIMIT);
  });

  it("anchors past a tie using position, not rank", () => {
    // Two climbers tie at rank 20, so everyone below sits one offset
    // lower than their rank implies. Anchoring on `rank - 1` would
    // start the window a row late and misalign every fetched page.
    const rows = [
      stubRow(21, 21),
      stubRow(22, 22),
      stubRow(23, 23),
    ];
    expect(computeInitialOffset(rows, 21)).toBe(21);
    // `rank - 1` would have said 20 — the bug this replaced.
    expect(computeInitialOffset(rows, 21)).not.toBe(20);
  });
});

describe("seedCache", () => {
  it("keys rows by board position", () => {
    const rows = [stubRow(8), stubRow(9), stubRow(10)];
    const cache = seedCache(rows);
    expect(cache[7]?.rank).toBe(8);
    expect(cache[8]?.rank).toBe(9);
    expect(cache[9]?.rank).toBe(10);
    expect(cache[6]).toBeUndefined();
  });

  it("gives tied climbers distinct offsets", () => {
    // `dense_rank()` hands both of these rank 20. Keyed by `rank - 1`
    // the second overwrote the first at offset 19, leaving offset 20
    // free for `fetchRange` to fill with a row that was already cached
    // elsewhere — so the window rendered the same climber twice.
    const rows = [stubRow(20, 19), stubRow(20, 20), stubRow(21, 21)];
    const cache = seedCache(rows);

    expect(Object.keys(cache)).toHaveLength(3);
    expect(cache[19]?.user_id).toBe("u20-19");
    expect(cache[20]?.user_id).toBe("u20-20");
    expect(cache[21]?.rank).toBe(21);
  });

  it("never maps two offsets to the same climber", () => {
    // The rendered symptom, asserted directly: a 51-climber board with
    // three tied ranks must still produce one cache entry per climber.
    const rows = [
      stubRow(39, 38),
      stubRow(40, 39),
      stubRow(40, 40),
      stubRow(41, 41),
      stubRow(42, 42),
    ];
    const cache = seedCache(rows);
    const ids = Object.values(cache).map((r) => r.user_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(5);
  });

  it("skips rows with no board position", () => {
    const rows = [
      stubRow(8),
      { ...stubRow(9), board_position: undefined } as unknown as NeighbourhoodEntry,
    ];
    const cache = seedCache(rows);
    expect(Object.keys(cache)).toHaveLength(1);
    expect(cache[7]?.rank).toBe(8);
  });

  it("handles an empty list", () => {
    expect(seedCache([])).toEqual({});
  });
});

describe("firstMissingRange", () => {
  it("returns null when every offset in the range is cached", () => {
    const cache: RowCache = {
      5: stubRow(6),
      6: stubRow(7),
      7: stubRow(8),
    };
    expect(firstMissingRange(cache, 5, 8)).toBeNull();
  });

  it("returns the whole range when the cache is empty", () => {
    expect(firstMissingRange({}, 5, 10)).toEqual({ start: 5, count: 5 });
  });

  it("finds a gap inside a partially-filled cache", () => {
    const cache: RowCache = {
      5: stubRow(6),
      6: stubRow(7),
      // 7 + 8 missing
      9: stubRow(10),
    };
    expect(firstMissingRange(cache, 5, 10)).toEqual({ start: 7, count: 2 });
  });

  it("returns only the FIRST contiguous gap — later holes get a follow-up pass", () => {
    const cache: RowCache = {
      5: stubRow(6),
      // 6 missing
      7: stubRow(8),
      // 8 missing
      9: stubRow(10),
    };
    const result = firstMissingRange(cache, 5, 10);
    expect(result).toEqual({ start: 6, count: 1 });
  });

  it("handles a gap at the leading edge", () => {
    const cache: RowCache = { 7: stubRow(8), 8: stubRow(9) };
    expect(firstMissingRange(cache, 5, 9)).toEqual({ start: 5, count: 2 });
  });

  it("handles a gap at the trailing edge", () => {
    const cache: RowCache = { 5: stubRow(6), 6: stubRow(7) };
    expect(firstMissingRange(cache, 5, 10)).toEqual({ start: 7, count: 3 });
  });

  it("returns null for an empty range", () => {
    expect(firstMissingRange({}, 5, 5)).toBeNull();
  });
});
