import { describe, it, expect } from "vitest";
import type { MatchHistoryRow } from "./match-types";
import { computeMatchLifetimeStats } from "./match-stats";

function makeMatch(overrides: Partial<MatchHistoryRow> = {}): MatchHistoryRow {
  return {
    set_id: "match-1",
    name: null,
    location: null,
    ended_at: "2026-01-01T00:00:00Z",
    started_at: "2026-01-01T00:00:00Z",
    duration_seconds: 3600,
    player_count: 4,
    user_rank: 2,
    user_sends: 3,
    user_flashes: 1,
    user_points: 12,
    user_is_winner: false,
    winner_user_id: "other-user",
    winner_username: "winner",
    winner_display_name: "Winner",
    ...overrides,
  };
}

describe("computeMatchLifetimeStats", () => {
  it("returns zero-shaped totals when the climber has no matches", () => {
    expect(computeMatchLifetimeStats([])).toEqual({
      matchesPlayed: 0,
      matchesWon: 0,
      bestFinish: null,
      totalSends: 0,
      totalFlashes: 0,
      totalPoints: 0,
      flashRate: null,
      pointsPerMatch: null,
    });
  });

  it("sums sends/flashes/points across all matches", () => {
    const matches = [
      makeMatch({ user_sends: 3, user_flashes: 1, user_points: 12 }),
      makeMatch({ user_sends: 5, user_flashes: 2, user_points: 20 }),
      makeMatch({ user_sends: 4, user_flashes: 4, user_points: 16 }),
    ];
    const stats = computeMatchLifetimeStats(matches);
    expect(stats.totalSends).toBe(12);
    expect(stats.totalFlashes).toBe(7);
    expect(stats.totalPoints).toBe(48);
  });

  it("counts matches played + matches won correctly", () => {
    const matches = [
      makeMatch({ user_is_winner: true }),
      makeMatch({ user_is_winner: false }),
      makeMatch({ user_is_winner: true }),
      makeMatch({ user_is_winner: true }),
    ];
    const stats = computeMatchLifetimeStats(matches);
    expect(stats.matchesPlayed).toBe(4);
    expect(stats.matchesWon).toBe(3);
  });

  it("bestFinish picks the lowest user_rank across all matches", () => {
    const matches = [
      makeMatch({ user_rank: 5 }),
      makeMatch({ user_rank: 1 }),
      makeMatch({ user_rank: 3 }),
    ];
    expect(computeMatchLifetimeStats(matches).bestFinish).toBe(1);
  });

  // Regression: a player who joined a match but logged zero sends comes
  // back from the RPC with user_rank=0. Earlier code seeded bestFinish
  // from matches[0].user_rank then compared with `<` — if that first match
  // had rank=0, every later match's real rank (e.g. 1, 2, 3) failed
  // `r < 0`, leaving bestFinish stuck at 0 and silently hiding podium
  // finishes.
  it("ignores user_rank=0 rows (unranked) when picking bestFinish", () => {
    const matches = [
      makeMatch({ user_rank: 0 }), // unranked — joined but logged nothing
      makeMatch({ user_rank: 1 }), // real 1st place
      makeMatch({ user_rank: 4 }),
    ];
    expect(computeMatchLifetimeStats(matches).bestFinish).toBe(1);
  });

  it("returns bestFinish null when every match is unranked", () => {
    const matches = [
      makeMatch({ user_rank: 0 }),
      makeMatch({ user_rank: 0 }),
    ];
    expect(computeMatchLifetimeStats(matches).bestFinish).toBeNull();
  });

  it("flashRate computes flashes/sends as a fraction (null when no sends)", () => {
    expect(
      computeMatchLifetimeStats([
        makeMatch({ user_sends: 4, user_flashes: 1 }),
      ]).flashRate,
    ).toBeCloseTo(0.25);

    // No completions across matches → flashRate is null (not 0/0 NaN).
    expect(
      computeMatchLifetimeStats([
        makeMatch({ user_sends: 0, user_flashes: 0 }),
      ]).flashRate,
    ).toBeNull();
  });

  it("pointsPerMatch is rounded to 1dp", () => {
    const matches = [
      makeMatch({ user_points: 10 }),
      makeMatch({ user_points: 13 }),
      makeMatch({ user_points: 14 }),
    ];
    // 37 / 3 = 12.333… → 12.3
    expect(computeMatchLifetimeStats(matches).pointsPerMatch).toBe(12.3);
  });

  it("a single-match climber gets bestFinish + pointsPerMatch from that one match", () => {
    const stats = computeMatchLifetimeStats([
      makeMatch({ user_rank: 4, user_points: 11 }),
    ]);
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.bestFinish).toBe(4);
    expect(stats.pointsPerMatch).toBe(11);
  });
});
