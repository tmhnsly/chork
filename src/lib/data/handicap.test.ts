import { describe, it, expect } from "vitest";
import {
  handicapMultiplier,
  handicapPointsTenths,
  formatHandicapPoints,
} from "./handicap";

/**
 * The design brief was "balanced so a V2 climber could compete with a
 * V6 climber". These tests are how that claim is checked rather than
 * asserted — the balance ones below simulate a real session and fail
 * if the taper stops producing a contest.
 */

describe("handicapMultiplier", () => {
  it("gives full value at your limit", () => {
    expect(handicapMultiplier(2, 2)).toBe(1);
    expect(handicapMultiplier(6, 6)).toBe(1);
  });

  it("gives full value — and no more — above your limit", () => {
    // A bonus here would make declaring a low ceiling strictly better
    // than being honest: every hard send would multiply up. A number
    // everyone games is worse than no number.
    expect(handicapMultiplier(4, 2)).toBe(1);
    expect(handicapMultiplier(9, 2)).toBe(1);
  });

  it("tapers as the route drops below your limit", () => {
    const ceiling = 6;
    const values = [0, 1, 2, 3, 4, 5].map((below) =>
      handicapMultiplier(ceiling - below, ceiling),
    );
    // Monotonically decreasing, never increasing.
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
    expect(values[0]).toBe(1);
  });

  it("counts nothing more than two grades below your limit", () => {
    // The cutoff IS the balance mechanism — see the measurements in
    // handicap.ts. A strong climber's warm-ups scoring zero is the
    // point, not an oversight: they cost nothing, so they earn
    // nothing, and without the cutoff volume beats the handicap.
    expect(handicapMultiplier(3, 6)).toBe(0);
    expect(handicapMultiplier(0, 6)).toBe(0);
    // The band itself is inclusive of two grades below.
    expect(handicapMultiplier(4, 6)).toBeGreaterThan(0);
  });
});

describe("handicapPointsTenths", () => {
  const flash = { attempts: 1, completed: true, zone: false };
  const threeGo = { attempts: 3, completed: true, zone: false };
  const failed = { attempts: 5, completed: false, zone: false };

  it("scores a flash at your limit at full base value", () => {
    // computePoints: flash = 4.
    expect(handicapPointsTenths(flash, 6, 6)).toBe(40);
  });

  it("scores the same achievement the same for either climber", () => {
    // The whole point: a V2's V2 and a V6's V6 are the same thing.
    expect(handicapPointsTenths(flash, 2, 2)).toBe(
      handicapPointsTenths(flash, 6, 6),
    );
  });

  it("discounts a route just below your limit, and drops the rest", () => {
    const atLimit = handicapPointsTenths(flash, 6, 6);
    const oneBelow = handicapPointsTenths(flash, 5, 6);
    const warmUp = handicapPointsTenths(flash, 1, 6);
    expect(oneBelow).toBeLessThan(atLimit);
    expect(oneBelow).toBeGreaterThan(0);
    expect(warmUp).toBe(0);
  });

  it("keeps an unsent route worth nothing", () => {
    // computePoints returns 0 for incomplete; no multiplier rescues it.
    expect(handicapPointsTenths(failed, 6, 6)).toBe(0);
  });

  it("still counts the zone bonus, since it rides on base points", () => {
    const withZone = handicapPointsTenths(
      { ...threeGo, zone: true }, 6, 6,
    );
    const without = handicapPointsTenths(threeGo, 6, 6);
    expect(withZone).toBeGreaterThan(without);
  });

  it("falls back to base points when the handicap can't apply", () => {
    // An ungraded route, or a climber who hasn't declared a ceiling.
    // Scoring them zero would be worse than scoring them plainly.
    expect(handicapPointsTenths(flash, null, 6)).toBe(40);
    expect(handicapPointsTenths(flash, 6, null)).toBe(40);
    expect(handicapPointsTenths(flash, null, null)).toBe(40);
  });

  it("returns whole tenths so totals sum exactly", () => {
    for (let grade = 0; grade <= 10; grade++) {
      const tenths = handicapPointsTenths(threeGo, grade, 6);
      expect(Number.isInteger(tenths)).toBe(true);
    }
  });
});

// ── The brief, checked ───────────────────────────────────────────

describe("a V2 climber can compete with a V6 climber", () => {
  /**
   * One Match, routes V0–V6, both climbers trying everything.
   *
   * Each performs realistically FOR THEIR GRADE: flashes what's well
   * within reach, works what's near the limit, fails above it. That
   * is the situation the handicap exists for — without it the V6
   * climber wins on volume alone, because they send seven routes and
   * the V2 climber sends three.
   */
  const ROUTES = [0, 1, 2, 3, 4, 5, 6];

  /** How a climber of `ceiling` fares on a route of `grade`. */
  function performance(grade: number, ceiling: number) {
    const below = ceiling - grade;
    if (below < 0) return { attempts: 4, completed: false, zone: false };
    if (below === 0) return { attempts: 4, completed: true, zone: false };
    if (below === 1) return { attempts: 2, completed: true, zone: false };
    return { attempts: 1, completed: true, zone: false };
  }

  function sessionTotal(ceiling: number, handicapped: boolean): number {
    return ROUTES.reduce((sum, grade) => {
      const log = performance(grade, ceiling);
      return (
        sum
        + handicapPointsTenths(log, handicapped ? grade : null, handicapped ? ceiling : null)
      );
    }, 0);
  }

  it("without a handicap, the stronger climber runs away with it", () => {
    // Establishes the problem the feature solves — if this ever stops
    // being true the simulation has drifted and the balance test
    // below is measuring nothing.
    const weak = sessionTotal(2, false);
    const strong = sessionTotal(6, false);
    expect(strong).toBeGreaterThan(weak * 1.8);
  });

  it("with a handicap, it's a contest", () => {
    const weak = sessionTotal(2, true);
    const strong = sessionTotal(6, true);
    // Dead level, in fact: each climber's counted band is the same
    // width, so the board is decided purely by how they climbed.
    expect(weak).toBe(strong);
  });

  it("holds across every ability the Set actually caters for", () => {
    // Not just the V2-vs-V6 case from the brief — otherwise the taper
    // is tuned to one example rather than to the shape of the
    // problem. Ceilings V2–V6 all have a full three-route band in a
    // V0–V6 Set.
    const totals = [2, 3, 4, 5, 6].map((c) => sessionTotal(c, true));
    expect(new Set(totals).size).toBe(1);
  });

  it("can't rescue a climber the Set has no routes for", () => {
    // The honest limit of any handicap: a V8 climber in a Set topping
    // out at V6 never climbs at their limit, and a V1 climber has
    // only two routes at or below theirs. The fix is setting routes
    // for the people present, not arithmetic.
    const catered = sessionTotal(4, true);
    expect(sessionTotal(8, true)).toBeLessThan(catered);
    expect(sessionTotal(1, true)).toBeLessThan(catered);
  });

  it("does not stop a low ceiling being worth declaring", () => {
    // Documents the known hole rather than pretending it's closed:
    // a strong climber declaring low fills their band with routes
    // they flash. Capping above-ceiling at 1 removes the biggest
    // lever, not the incentive. The real fix is deriving the ceiling
    // from history — see the note in handicap.ts.
    const honest = sessionTotal(6, true);
    const sandbagged = ROUTES.reduce(
      (sum, grade) =>
        sum + handicapPointsTenths(performance(grade, 6), grade, 2),
      0,
    );
    expect(sandbagged).toBeGreaterThan(honest);
  });

  it("still rewards climbing better than the next person", () => {
    // Balance must not become "everyone ties". Two climbers of the
    // same ceiling, one flashing what the other works, must separate.
    const flashed = ROUTES.reduce(
      (sum, g) =>
        sum + handicapPointsTenths({ attempts: 1, completed: true, zone: false }, g, 4),
      0,
    );
    const worked = ROUTES.reduce(
      (sum, g) =>
        sum + handicapPointsTenths({ attempts: 4, completed: true, zone: false }, g, 4),
      0,
    );
    expect(flashed).toBeGreaterThan(worked);
  });

  it("rewards reaching above your grade", () => {
    // A V2 climber who sends the V4 should gain on a V2 climber who
    // didn't — the upset is the best thing that can happen in a Match.
    const base = ROUTES.filter((g) => g <= 2).reduce(
      (sum, g) => sum + handicapPointsTenths(performance(g, 2), g, 2),
      0,
    );
    const upset =
      base
      + handicapPointsTenths({ attempts: 3, completed: true, zone: false }, 4, 2);
    expect(upset).toBeGreaterThan(base);
  });
});

describe("formatHandicapPoints", () => {
  it("drops a pointless decimal", () => {
    expect(formatHandicapPoints(40)).toBe("4");
    expect(formatHandicapPoints(0)).toBe("0");
  });

  it("keeps one that carries information", () => {
    expect(formatHandicapPoints(28)).toBe("2.8");
  });
});
