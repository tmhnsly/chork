import { describe, it, expect } from "vitest";
import { evaluateBadges, type BadgeContext } from "./badges";

function makeCtx(overrides: Partial<BadgeContext> = {}): BadgeContext {
  return {
    totalFlashes: 0,
    totalSends: 0,
    totalPoints: 0,
    completedRoutesBySet: new Map(),
    totalRoutesBySet: new Map(),
    ...overrides,
  };
}

function findBadge(badges: ReturnType<typeof evaluateBadges>, id: string) {
  return badges.find((b) => b.badge.id === id)!;
}

describe("evaluateBadges", () => {
  it("returns all badges as locked for a brand new user", () => {
    const badges = evaluateBadges(makeCtx());
    expect(badges.every((b) => !b.earned)).toBe(true);
  });

  describe("First Flash", () => {
    it("locked with 0 flashes, shows progress 0/1", () => {
      const b = findBadge(evaluateBadges(makeCtx()), "first-flash");
      expect(b.earned).toBe(false);
      if (!b.earned) {
        expect(b.progress).toBe(0);
        expect(b.current).toBe(0);
      }
    });

    it("earned with 1+ flashes", () => {
      const b = findBadge(evaluateBadges(makeCtx({ totalFlashes: 1 })), "first-flash");
      expect(b.earned).toBe(true);
    });
  });

  describe("Flash Mob (10 flashes)", () => {
    it("shows progress at 3/10", () => {
      const b = findBadge(evaluateBadges(makeCtx({ totalFlashes: 3 })), "flash-mob");
      expect(b.earned).toBe(false);
      if (!b.earned) {
        expect(b.progress).toBeCloseTo(0.3);
        expect(b.current).toBe(3);
      }
    });

    it("earned at exactly 10", () => {
      const b = findBadge(evaluateBadges(makeCtx({ totalFlashes: 10 })), "flash-mob");
      expect(b.earned).toBe(true);
    });

    it("earned above 10", () => {
      const b = findBadge(evaluateBadges(makeCtx({ totalFlashes: 25 })), "flash-mob");
      expect(b.earned).toBe(true);
    });
  });

  describe("First Send", () => {
    it("earned with 1 send", () => {
      const b = findBadge(evaluateBadges(makeCtx({ totalSends: 1 })), "first-send");
      expect(b.earned).toBe(true);
    });
  });

  describe("Century (100 points)", () => {
    it("locked at 99 points", () => {
      const b = findBadge(evaluateBadges(makeCtx({ totalPoints: 99 })), "century");
      expect(b.earned).toBe(false);
    });

    it("earned at 100 points", () => {
      const b = findBadge(evaluateBadges(makeCtx({ totalPoints: 100 })), "century");
      expect(b.earned).toBe(true);
    });
  });

  describe("Buckle My Shoe (routes 1 and 2 in same set)", () => {
    it("locked when only route 1 is completed", () => {
      const b = findBadge(evaluateBadges(makeCtx({
        completedRoutesBySet: new Map([["s1", new Set([1])]]),
      })), "buckle-my-shoe");
      expect(b.earned).toBe(false);
    });

    it("earned when both routes 1 and 2 are completed in same set", () => {
      const b = findBadge(evaluateBadges(makeCtx({
        completedRoutesBySet: new Map([["s1", new Set([1, 2, 5])]]),
      })), "buckle-my-shoe");
      expect(b.earned).toBe(true);
    });

    it("not earned when routes 1 and 2 are in different sets", () => {
      const b = findBadge(evaluateBadges(makeCtx({
        completedRoutesBySet: new Map([
          ["s1", new Set([1])],
          ["s2", new Set([2])],
        ]),
      })), "buckle-my-shoe");
      expect(b.earned).toBe(false);
    });
  });

  describe("Set Cleaner (all routes in a set)", () => {
    it("locked when not all routes completed", () => {
      const b = findBadge(evaluateBadges(makeCtx({
        completedRoutesBySet: new Map([["s1", new Set([1, 2, 3])]]),
        totalRoutesBySet: new Map([["s1", 14]]),
      })), "set-cleaner");
      expect(b.earned).toBe(false);
    });

    it("earned when all routes in a set are completed", () => {
      const all = new Set(Array.from({ length: 14 }, (_, i) => i + 1));
      const b = findBadge(evaluateBadges(makeCtx({
        completedRoutesBySet: new Map([["s1", all]]),
        totalRoutesBySet: new Map([["s1", 14]]),
      })), "set-cleaner");
      expect(b.earned).toBe(true);
    });

    it("earned if any set is fully completed", () => {
      const b = findBadge(evaluateBadges(makeCtx({
        completedRoutesBySet: new Map([
          ["s1", new Set([1, 2])],
          ["s2", new Set([1, 2, 3])],
        ]),
        totalRoutesBySet: new Map([
          ["s1", 14],
          ["s2", 3],
        ]),
      })), "set-cleaner");
      expect(b.earned).toBe(true);
    });
  });
});
