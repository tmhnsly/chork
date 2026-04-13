import { describe, it, expect } from "vitest";
import {
  evaluateBadges,
  evaluateBadgesForSet,
  type BadgeContext,
} from "./badges";

function makeCtx(overrides: Partial<BadgeContext> = {}): BadgeContext {
  return {
    totalFlashes: 0,
    totalSends: 0,
    totalPoints: 0,
    completedRoutesBySet: new Map(),
    totalRoutesBySet: new Map(),
    flashedRoutesBySet: new Map(),
    zoneAvailableBySet: new Map(),
    zoneClaimedBySet: new Map(),
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

  // ── Flash ladder (Pokémon electric moves) ──────────
  describe("flash milestones", () => {
    it("locks the lowest tier at 0/1 with progress 0", () => {
      const b = findBadge(evaluateBadges(makeCtx()), "flash-thundershock");
      expect(b.earned).toBe(false);
      if (!b.earned) expect(b.current).toBe(0);
    });

    it("unlocks Thundershock at 1 flash", () => {
      const b = findBadge(
        evaluateBadges(makeCtx({ totalFlashes: 1 })),
        "flash-thundershock",
      );
      expect(b.earned).toBe(true);
    });

    it("tracks mid-tier progress (10 flashes → Spark earned, Thunder Punch in progress)", () => {
      const ctx = makeCtx({ totalFlashes: 10 });
      expect(findBadge(evaluateBadges(ctx), "flash-spark").earned).toBe(true);
      const punch = findBadge(evaluateBadges(ctx), "flash-thunderpunch");
      expect(punch.earned).toBe(false);
      if (!punch.earned) {
        expect(punch.current).toBe(10);
        expect(punch.progress).toBeCloseTo(10 / 25);
      }
    });

    it("Saviour of the Universe stays locked until 1000 flashes", () => {
      expect(
        findBadge(
          evaluateBadges(makeCtx({ totalFlashes: 999 })),
          "flash-saviour-of-the-universe",
        ).earned,
      ).toBe(false);
      expect(
        findBadge(
          evaluateBadges(makeCtx({ totalFlashes: 1000 })),
          "flash-saviour-of-the-universe",
        ).earned,
      ).toBe(true);
    });
  });

  // ── Sends ──────────────────────────────────────────
  describe("First (A)send", () => {
    it("earns on the first completed route", () => {
      const b = findBadge(
        evaluateBadges(makeCtx({ totalSends: 1 })),
        "first-ascend",
      );
      expect(b.earned).toBe(true);
    });
  });

  describe("Century (100 points)", () => {
    it("locked at 99, earned at 100", () => {
      expect(
        findBadge(evaluateBadges(makeCtx({ totalPoints: 99 })), "century")
          .earned,
      ).toBe(false);
      expect(
        findBadge(evaluateBadges(makeCtx({ totalPoints: 100 })), "century")
          .earned,
      ).toBe(true);
    });
  });

  // ── Nursery-rhyme pairs ────────────────────────────
  describe("rhyme pairs", () => {
    it.each([
      ["tie-your-shoe", [1, 2]],
      ["pick-up-the-floor", [3, 4]],
      ["dont-play-tricks", [5, 6]],
      ["clean-your-plate", [7, 8]],
      ["start-over-again", [9, 10]],
    ] as const)(
      "%s earns when both numbers are completed in the same set",
      (id, nums) => {
        const b = findBadge(
          evaluateBadges(
            makeCtx({
              completedRoutesBySet: new Map([["s1", new Set(nums)]]),
            }),
          ),
          id,
        );
        expect(b.earned).toBe(true);
      },
    );

    it("does NOT earn when the numbers are split across sets", () => {
      const b = findBadge(
        evaluateBadges(
          makeCtx({
            completedRoutesBySet: new Map([
              ["s1", new Set([1])],
              ["s2", new Set([2])],
            ]),
          }),
        ),
        "tie-your-shoe",
      );
      expect(b.earned).toBe(false);
    });
  });

  // ── Set-mastery conditions ─────────────────────────
  describe("Saviour of the Universe", () => {
    it("locked when not every route in a set is flashed", () => {
      const b = findBadge(
        evaluateBadges(
          makeCtx({
            flashedRoutesBySet: new Map([["s1", new Set([1, 2])]]),
            totalRoutesBySet: new Map([["s1", 3]]),
          }),
        ),
        "saviour-of-the-universe",
      );
      expect(b.earned).toBe(false);
    });

    it("earned when every route in a set is flashed", () => {
      const all = new Set([1, 2, 3]);
      const b = findBadge(
        evaluateBadges(
          makeCtx({
            flashedRoutesBySet: new Map([["s1", all]]),
            totalRoutesBySet: new Map([["s1", 3]]),
          }),
        ),
        "saviour-of-the-universe",
      );
      expect(b.earned).toBe(true);
    });
  });

  describe("It's Not Easy Being Green", () => {
    it("locked when any route in the set was flashed", () => {
      const all = new Set([1, 2, 3]);
      const b = findBadge(
        evaluateBadges(
          makeCtx({
            completedRoutesBySet: new Map([["s1", all]]),
            flashedRoutesBySet: new Map([["s1", new Set([1])]]),
            totalRoutesBySet: new Map([["s1", 3]]),
          }),
        ),
        "not-easy-being-green",
      );
      expect(b.earned).toBe(false);
    });

    it("earned when every route is completed and NONE were flashed", () => {
      const all = new Set([1, 2, 3]);
      const b = findBadge(
        evaluateBadges(
          makeCtx({
            completedRoutesBySet: new Map([["s1", all]]),
            flashedRoutesBySet: new Map([["s1", new Set()]]),
            totalRoutesBySet: new Map([["s1", 3]]),
          }),
        ),
        "not-easy-being-green",
      );
      expect(b.earned).toBe(true);
    });
  });

  describe("In the Zone", () => {
    it("locked when a zone hasn't been claimed", () => {
      const b = findBadge(
        evaluateBadges(
          makeCtx({
            zoneAvailableBySet: new Map([["s1", new Set([2, 5, 9])]]),
            zoneClaimedBySet: new Map([["s1", new Set([2, 5])]]),
          }),
        ),
        "in-the-zone",
      );
      expect(b.earned).toBe(false);
    });

    it("earned when every zone in a set has been claimed", () => {
      const b = findBadge(
        evaluateBadges(
          makeCtx({
            zoneAvailableBySet: new Map([["s1", new Set([2, 5, 9])]]),
            zoneClaimedBySet: new Map([["s1", new Set([2, 5, 9])]]),
          }),
        ),
        "in-the-zone",
      );
      expect(b.earned).toBe(true);
    });

    it("ignores sets with zero zone-capable routes", () => {
      const b = findBadge(
        evaluateBadges(
          makeCtx({
            zoneAvailableBySet: new Map([["s1", new Set()]]),
            zoneClaimedBySet: new Map([["s1", new Set()]]),
          }),
        ),
        "in-the-zone",
      );
      expect(b.earned).toBe(false);
    });
  });
});

// ── Per-set badge evaluation (set detail sheet) ─────
describe("evaluateBadgesForSet", () => {
  it("picks up rhyme pairs, saviour, green and zone in a single set snapshot", () => {
    const badges = evaluateBadgesForSet({
      completed: new Set([1, 2, 3]),
      flashed: new Set([1, 2, 3]),
      zoneAvailable: new Set([2]),
      zoneClaimed: new Set([2]),
      totalRoutes: 3,
    });
    const ids = badges.map((b) => b.id);
    expect(ids).toContain("tie-your-shoe");
    expect(ids).toContain("saviour-of-the-universe");
    expect(ids).toContain("in-the-zone");
    // Not green because routes WERE flashed.
    expect(ids).not.toContain("not-easy-being-green");
  });

  it("awards Not Easy Being Green only when zero flashes and all sent", () => {
    const badges = evaluateBadgesForSet({
      completed: new Set([1, 2, 3]),
      flashed: new Set(),
      zoneAvailable: new Set(),
      zoneClaimed: new Set(),
      totalRoutes: 3,
    });
    expect(badges.map((b) => b.id)).toContain("not-easy-being-green");
  });
});
