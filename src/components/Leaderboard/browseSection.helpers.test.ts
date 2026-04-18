import { describe, it, expect } from "vitest";
import {
  TOP_LIMIT,
  computeInitialOffset,
  firstMissingRange,
  seedCache,
  type RowCache,
} from "./browseSection.helpers";
import type { LeaderboardEntry } from "@/lib/data";

const stubRow = (rank: number): LeaderboardEntry => ({
  user_id: `u${rank}`,
  username: `u${rank}`,
  name: `U ${rank}`,
  avatar_url: "",
  rank,
  sends: 0,
  flashes: 0,
  zones: 0,
  points: 0,
});

describe("computeInitialOffset", () => {
  it("anchors on the first neighbourhood row's rank", () => {
    const rows = [stubRow(8), stubRow(9), stubRow(10), stubRow(11), stubRow(12)];
    // First row rank 8 → offset 7 (rank-1)
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

  it("falls back to TOP_LIMIT when first row has no rank", () => {
    const rows: LeaderboardEntry[] = [{ ...stubRow(0), rank: null }];
    expect(computeInitialOffset(rows, 8)).toBe(TOP_LIMIT);
  });
});

describe("seedCache", () => {
  it("keys rows by offset (rank − 1)", () => {
    const rows = [stubRow(8), stubRow(9), stubRow(10)];
    const cache = seedCache(rows);
    expect(cache[7]?.rank).toBe(8);
    expect(cache[8]?.rank).toBe(9);
    expect(cache[9]?.rank).toBe(10);
    expect(cache[6]).toBeUndefined();
  });

  it("skips rows with a null rank", () => {
    const rows: LeaderboardEntry[] = [
      stubRow(8),
      { ...stubRow(0), rank: null },
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
