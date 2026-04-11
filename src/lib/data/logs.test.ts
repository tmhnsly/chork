import { describe, it, expect } from "vitest";
import { isFlash, computePoints, computeMaxPoints } from "./logs";

describe("isFlash", () => {
  it("returns true for 1 attempt + completed", () => {
    expect(isFlash({ attempts: 1, completed: true })).toBe(true);
  });

  it("returns false for multiple attempts even if completed", () => {
    expect(isFlash({ attempts: 2, completed: true })).toBe(false);
    expect(isFlash({ attempts: 5, completed: true })).toBe(false);
  });

  it("returns false for 1 attempt but not completed", () => {
    expect(isFlash({ attempts: 1, completed: false })).toBe(false);
  });

  it("returns false for 0 attempts", () => {
    expect(isFlash({ attempts: 0, completed: false })).toBe(false);
  });
});

describe("computePoints", () => {
  it("gives 4 points for a flash (1 attempt, completed)", () => {
    expect(computePoints({ attempts: 1, completed: true, zone: false })).toBe(4);
  });

  it("gives 3 points for 2 attempts", () => {
    expect(computePoints({ attempts: 2, completed: true, zone: false })).toBe(3);
  });

  it("gives 2 points for 3 attempts", () => {
    expect(computePoints({ attempts: 3, completed: true, zone: false })).toBe(2);
  });

  it("gives 1 point for 4+ attempts", () => {
    expect(computePoints({ attempts: 4, completed: true, zone: false })).toBe(1);
    expect(computePoints({ attempts: 10, completed: true, zone: false })).toBe(1);
    expect(computePoints({ attempts: 99, completed: true, zone: false })).toBe(1);
  });

  it("gives 0 points for incomplete routes", () => {
    expect(computePoints({ attempts: 3, completed: false, zone: false })).toBe(0);
    expect(computePoints({ attempts: 0, completed: false, zone: false })).toBe(0);
  });

  it("adds 1 zone bonus independent of completion", () => {
    expect(computePoints({ attempts: 1, completed: true, zone: true })).toBe(5);
    expect(computePoints({ attempts: 3, completed: true, zone: true })).toBe(3);
    expect(computePoints({ attempts: 0, completed: false, zone: true })).toBe(1);
  });
});

describe("computeMaxPoints", () => {
  it("calculates max as flash(4) * routes + zone(1) * zone routes", () => {
    expect(computeMaxPoints(14, 5)).toBe(14 * 4 + 5 * 1); // 61
  });

  it("returns 0 for 0 routes", () => {
    expect(computeMaxPoints(0, 0)).toBe(0);
  });

  it("works with no zone routes", () => {
    expect(computeMaxPoints(10, 0)).toBe(40);
  });

  it("works when all routes have zones", () => {
    expect(computeMaxPoints(10, 10)).toBe(50);
  });
});
