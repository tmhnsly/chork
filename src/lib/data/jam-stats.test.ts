import { describe, it, expect } from "vitest";
import type { JamHistoryRow } from "./jam-types";
import { computeJamLifetimeStats } from "./jam-stats";

function makeJam(overrides: Partial<JamHistoryRow> = {}): JamHistoryRow {
  return {
    summary_id: "summary-1",
    jam_id: "jam-1",
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

describe("computeJamLifetimeStats", () => {
  it("returns zero-shaped totals when the climber has no jams", () => {
    expect(computeJamLifetimeStats([])).toEqual({
      jamsPlayed: 0,
      jamsWon: 0,
      bestFinish: null,
      totalSends: 0,
      totalFlashes: 0,
      totalPoints: 0,
      flashRate: null,
      pointsPerJam: null,
    });
  });

  it("sums sends/flashes/points across all jams", () => {
    const jams = [
      makeJam({ user_sends: 3, user_flashes: 1, user_points: 12 }),
      makeJam({ user_sends: 5, user_flashes: 2, user_points: 20 }),
      makeJam({ user_sends: 4, user_flashes: 4, user_points: 16 }),
    ];
    const stats = computeJamLifetimeStats(jams);
    expect(stats.totalSends).toBe(12);
    expect(stats.totalFlashes).toBe(7);
    expect(stats.totalPoints).toBe(48);
  });

  it("counts jams played + jams won correctly", () => {
    const jams = [
      makeJam({ user_is_winner: true }),
      makeJam({ user_is_winner: false }),
      makeJam({ user_is_winner: true }),
      makeJam({ user_is_winner: true }),
    ];
    const stats = computeJamLifetimeStats(jams);
    expect(stats.jamsPlayed).toBe(4);
    expect(stats.jamsWon).toBe(3);
  });

  it("bestFinish picks the lowest user_rank across all jams", () => {
    const jams = [
      makeJam({ user_rank: 5 }),
      makeJam({ user_rank: 1 }),
      makeJam({ user_rank: 3 }),
    ];
    expect(computeJamLifetimeStats(jams).bestFinish).toBe(1);
  });

  // Regression: a player who joined a jam but logged zero sends comes
  // back from the RPC with user_rank=0. Earlier code seeded bestFinish
  // from jams[0].user_rank then compared with `<` — if that first jam
  // had rank=0, every later jam's real rank (e.g. 1, 2, 3) failed
  // `r < 0`, leaving bestFinish stuck at 0 and silently hiding podium
  // finishes.
  it("ignores user_rank=0 rows (unranked) when picking bestFinish", () => {
    const jams = [
      makeJam({ user_rank: 0 }), // unranked — joined but logged nothing
      makeJam({ user_rank: 1 }), // real 1st place
      makeJam({ user_rank: 4 }),
    ];
    expect(computeJamLifetimeStats(jams).bestFinish).toBe(1);
  });

  it("returns bestFinish null when every jam is unranked", () => {
    const jams = [
      makeJam({ user_rank: 0 }),
      makeJam({ user_rank: 0 }),
    ];
    expect(computeJamLifetimeStats(jams).bestFinish).toBeNull();
  });

  it("flashRate computes flashes/sends as a fraction (null when no sends)", () => {
    expect(
      computeJamLifetimeStats([
        makeJam({ user_sends: 4, user_flashes: 1 }),
      ]).flashRate,
    ).toBeCloseTo(0.25);

    // No completions across jams → flashRate is null (not 0/0 NaN).
    expect(
      computeJamLifetimeStats([
        makeJam({ user_sends: 0, user_flashes: 0 }),
      ]).flashRate,
    ).toBeNull();
  });

  it("pointsPerJam is rounded to 1dp", () => {
    const jams = [
      makeJam({ user_points: 10 }),
      makeJam({ user_points: 13 }),
      makeJam({ user_points: 14 }),
    ];
    // 37 / 3 = 12.333… → 12.3
    expect(computeJamLifetimeStats(jams).pointsPerJam).toBe(12.3);
  });

  it("a single-jam climber gets bestFinish + pointsPerJam from that one jam", () => {
    const stats = computeJamLifetimeStats([
      makeJam({ user_rank: 4, user_points: 11 }),
    ]);
    expect(stats.jamsPlayed).toBe(1);
    expect(stats.bestFinish).toBe(4);
    expect(stats.pointsPerJam).toBe(11);
  });
});
