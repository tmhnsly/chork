import { describe, it, expect } from "vitest";
import {
  computeAllTimeAggregates,
  flashRate,
  pointsPerSend,
  completionRate,
  routeCoverage,
  computeSetStreak,
} from "./profile-stats";

type Log = { route_id: string; attempts: number; completed: boolean; zone: boolean };

const log = (id: string, attempts: number, completed: boolean, zone = false): Log => ({
  route_id: id,
  attempts,
  completed,
  zone,
});

describe("computeAllTimeAggregates", () => {
  it("handles empty input", () => {
    expect(computeAllTimeAggregates([])).toEqual({
      sends: 0,
      flashes: 0,
      points: 0,
      totalAttempts: 0,
      uniqueRoutesAttempted: 0,
    });
  });

  it("counts flashes, sends, points, and attempts only on completed logs", () => {
    const logs: Log[] = [
      log("r1", 1, true),       // flash → 4 pts, 1 send, 1 attempt
      log("r2", 3, true, true), // 3 attempts → 2 pts + 1 zone = 3 pts
      log("r3", 2, false),      // attempted but not completed — counts as attempted route but not send
    ];
    const agg = computeAllTimeAggregates(logs);
    expect(agg.sends).toBe(2);
    expect(agg.flashes).toBe(1);
    expect(agg.points).toBe(7);
    expect(agg.totalAttempts).toBe(4); // 1 + 3 (incomplete excluded)
    expect(agg.uniqueRoutesAttempted).toBe(3);
  });

  it("excludes zero-attempt logs from uniqueRoutesAttempted", () => {
    const logs: Log[] = [log("r1", 0, false), log("r2", 1, true)];
    expect(computeAllTimeAggregates(logs).uniqueRoutesAttempted).toBe(1);
  });
});

describe("flashRate", () => {
  it("returns null when sends is 0", () => {
    expect(flashRate(0, 0)).toBeNull();
  });
  it("returns flashes/sends as a fraction", () => {
    expect(flashRate(10, 3)).toBeCloseTo(0.3);
  });
});

describe("pointsPerSend", () => {
  it("returns null when sends is 0", () => {
    expect(pointsPerSend(0, 0)).toBeNull();
  });
  it("rounds to 1dp", () => {
    expect(pointsPerSend(25, 7)).toBe(3.6);
  });
});

describe("completionRate", () => {
  it("returns null when nothing attempted", () => {
    expect(completionRate(0, 0)).toBeNull();
  });
  it("is sends divided by routes attempted", () => {
    expect(completionRate(3, 5)).toBe(0.6);
  });
});

describe("routeCoverage", () => {
  it("returns null when no total routes exist", () => {
    expect(routeCoverage(0, 0)).toBeNull();
  });
  it("is attempted divided by total", () => {
    expect(routeCoverage(5, 20)).toBe(0.25);
  });
});

describe("computeSetStreak", () => {
  it("returns 0/0 for empty input", () => {
    expect(computeSetStreak([])).toEqual({ current: 0, best: 0 });
  });

  it("current counts consecutive sends from newest", () => {
    // newest on left
    const sets = [{ hasSend: true }, { hasSend: true }, { hasSend: false }, { hasSend: true }];
    const result = computeSetStreak(sets);
    expect(result.current).toBe(2);
    expect(result.best).toBe(2);
  });

  it("current is 0 when most recent set has no sends", () => {
    const sets = [{ hasSend: false }, { hasSend: true }, { hasSend: true }];
    expect(computeSetStreak(sets)).toEqual({ current: 0, best: 2 });
  });

  it("best is the longest run anywhere", () => {
    const sets = [
      { hasSend: true },
      { hasSend: false },
      { hasSend: true },
      { hasSend: true },
      { hasSend: true },
      { hasSend: false },
      { hasSend: true },
    ];
    expect(computeSetStreak(sets)).toEqual({ current: 1, best: 3 });
  });
});
