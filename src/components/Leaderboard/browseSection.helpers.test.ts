import { describe, it, expect } from "vitest";
import {
  TOP_LIMIT,
  BROWSE_WINDOW,
  computeInitialOffset,
  computePrevOffset,
  computeNextOffset,
  computeReturnOffset,
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

describe("computePrevOffset", () => {
  it("steps back by BROWSE_WINDOW", () => {
    expect(computePrevOffset(15)).toBe(15 - BROWSE_WINDOW);
  });

  it("clamps to TOP_LIMIT", () => {
    expect(computePrevOffset(7)).toBe(TOP_LIMIT);
    expect(computePrevOffset(TOP_LIMIT)).toBe(TOP_LIMIT);
  });
});

describe("computeNextOffset", () => {
  it("steps forward by BROWSE_WINDOW (no upper clamp)", () => {
    expect(computeNextOffset(10)).toBe(15);
    expect(computeNextOffset(0)).toBe(BROWSE_WINDOW);
  });
});

describe("computeReturnOffset", () => {
  it("re-centres on userRank with half-window bias", () => {
    expect(computeReturnOffset(10)).toBe(7);
    expect(computeReturnOffset(20)).toBe(17);
  });

  it("clamps to TOP_LIMIT for users near the top", () => {
    expect(computeReturnOffset(6)).toBe(TOP_LIMIT);
    expect(computeReturnOffset(1)).toBe(TOP_LIMIT);
  });
});
