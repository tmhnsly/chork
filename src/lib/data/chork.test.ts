import { describe, it, expect } from "vitest";
import {
  allowanceFor,
  roundOutcome,
  playerState,
  penHolder,
  winner,
  CHORK_OUT_AT,
} from "./chork";

describe("allowanceFor", () => {
  it("gives everyone the setter's count", () => {
    // Set it in 3, everyone gets 3. The whole rule in one line.
    expect(allowanceFor(3, null, null)).toBe(3);
  });

  it("makes a flash a one-shot round", () => {
    // Flash-for-flash isn't a separate mode — it's this rule with
    // N = 1, which is why we didn't have to choose between them.
    expect(allowanceFor(1, 5, 5)).toBe(1);
  });

  it("buys an extra attempt per grade above your limit", () => {
    // A V6 challenge for a V4 climber: 2 grades up, 2 extra goes.
    expect(allowanceFor(2, 6, 4)).toBe(4);
  });

  it("buys nothing at or below your limit", () => {
    // You're expected to manage what you already climb.
    expect(allowanceFor(2, 4, 4)).toBe(2);
    expect(allowanceFor(2, 2, 6)).toBe(2);
  });

  it("falls back to the bare count when either side is unknown", () => {
    // An ungraded route, or a climber who declared no limit.
    // Guessing would be worse than not helping.
    expect(allowanceFor(3, null, 4)).toBe(3);
    expect(allowanceFor(3, 6, null)).toBe(3);
  });

  it("never gives less than one attempt", () => {
    // A setter's log can read 0 mid-edit; nobody gets zero goes.
    expect(allowanceFor(0, null, null)).toBe(1);
  });
});

describe("roundOutcome", () => {
  it("is safe when you send it inside the allowance", () => {
    expect(roundOutcome({ attempts: 2, completed: true }, 3)).toBe("safe");
    expect(roundOutcome({ attempts: 3, completed: true }, 3)).toBe("safe");
  });

  it("is still open while attempts remain", () => {
    expect(roundOutcome({ attempts: 1, completed: false }, 3)).toBeNull();
    expect(roundOutcome(null, 3)).toBeNull();
  });

  it("is a letter once the allowance is spent", () => {
    expect(roundOutcome({ attempts: 3, completed: false }, 3)).toBe("letter");
  });

  /**
   * The one that decides the rule's shape. Safety is "sent it WITHIN
   * the allowance", not "sent it" — otherwise a climber burns their
   * three goes, keeps pulling, tops out on the fourth, and the letter
   * they already earned quietly disappears.
   */
  it("does not let a send after the allowance erase the letter", () => {
    expect(roundOutcome({ attempts: 4, completed: true }, 3)).toBe("letter");
  });
});

describe("playerState", () => {
  it("spells the letters earned so far", () => {
    expect(playerState("p1", 2).spelled).toEqual(["C", "H"]);
    expect(playerState("p1", 0).spelled).toEqual([]);
  });

  it("puts you out at five", () => {
    expect(playerState("p1", CHORK_OUT_AT).isOut).toBe(true);
    expect(playerState("p1", CHORK_OUT_AT - 1).isOut).toBe(false);
  });

  it("can't spell past CHORK", () => {
    const over = playerState("p1", 9);
    expect(over.letters).toBe(CHORK_OUT_AT);
    expect(over.spelled).toHaveLength(CHORK_OUT_AT);
  });
});

describe("penHolder", () => {
  const order = ["a", "b", "c"];
  const nobodyOut = () => false;

  it("opens with the first seat", () => {
    expect(penHolder([], order, nobodyOut)).toBe("a");
  });

  it("keeps the pen while the setter keeps sending", () => {
    // The tension of the game: a climber on a streak dictates.
    const rounds = [{ routeId: "r1", setterId: "a", setterAttempts: 2 }];
    expect(penHolder(rounds, order, nobodyOut)).toBe("a");
  });

  it("passes it when the setter fails their own set", () => {
    // Not a round — nobody takes a letter — and the pen moves on.
    const rounds = [{ routeId: "r1", setterId: "a", setterAttempts: null }];
    expect(penHolder(rounds, order, nobodyOut)).toBe("b");
  });

  it("wraps around the seating order", () => {
    const rounds = [{ routeId: "r1", setterId: "c", setterAttempts: null }];
    expect(penHolder(rounds, order, nobodyOut)).toBe("a");
  });

  it("skips climbers who are out", () => {
    // Five letters means you don't set either.
    const rounds = [{ routeId: "r1", setterId: "a", setterAttempts: null }];
    expect(penHolder(rounds, order, (id) => id === "b")).toBe("c");
  });

  it("takes the pen off a setter who went out holding it", () => {
    const rounds = [{ routeId: "r1", setterId: "a", setterAttempts: 2 }];
    expect(penHolder(rounds, order, (id) => id === "a")).toBe("b");
  });

  it("has nobody to give it to when everyone is out", () => {
    expect(penHolder([], order, () => true)).toBeNull();
  });
});

describe("winner", () => {
  it("is the last climber standing", () => {
    const states = [playerState("a", 5), playerState("b", 2), playerState("c", 5)];
    expect(winner(states)).toBe("b");
  });

  it("is nobody while two are still in", () => {
    expect(winner([playerState("a", 4), playerState("b", 2)])).toBeNull();
  });

  it("is nobody in a solo game", () => {
    // You can't outlast yourself.
    expect(winner([playerState("a", 0)])).toBeNull();
  });
});

// ── The game, played through ────────────────────────────────────

describe("a game of Chork", () => {
  /**
   * Two climbers, a V6 setter and a V4 answerer, playing the mixed-
   * ability case the allowance rule exists for. Checks the rules
   * compose rather than each behaving alone.
   */
  it("lets the weaker climber survive a challenge above their limit", () => {
    // Setter sends a V6 in 2. Answerer's limit is V4, so 2 grades up
    // buys 2 extra goes: 4 in total.
    const allowance = allowanceFor(2, 6, 4);
    expect(allowance).toBe(4);
    // They send it on the fourth. Inside the allowance — safe.
    expect(roundOutcome({ attempts: 4, completed: true }, allowance)).toBe("safe");
    // Without the ceiling rule that same performance is a letter.
    expect(roundOutcome({ attempts: 4, completed: true }, 2)).toBe("letter");
  });

  it("ends when one climber has spelled CHORK", () => {
    let letters = 0;
    for (let round = 1; round <= CHORK_OUT_AT; round++) {
      // Loses every round: allowance spent, never sent.
      if (roundOutcome({ attempts: 2, completed: false }, 2) === "letter") {
        letters++;
      }
    }
    const states = [playerState("loser", letters), playerState("winner", 0)];
    expect(states[0].spelled.join("")).toBe("CHORK");
    expect(winner(states)).toBe("winner");
  });

  it("keeps the pen with a setter who never misses", () => {
    // Five straight sets, five straight sends — the pen never moves.
    const rounds = Array.from({ length: 5 }, (_, i) => ({
      routeId: `r${i}`,
      setterId: "strong",
      setterAttempts: 1,
    }));
    expect(penHolder(rounds, ["strong", "other"], () => false)).toBe("strong");
  });
});

// ── Cross-home parity ───────────────────────────────────────────

describe("the SQL says the same thing", () => {
  /**
   * `chork_allowance` and `chork_is_letter` mirror `allowanceFor` and
   * `roundOutcome`, for the same reason `compute_points` mirrors
   * `computePoints`: the live screen computes from realtime events
   * while the server ranks in SQL. A one-sided edit is a game whose
   * rules change depending on which screen you look at.
   *
   * Read from the migration text rather than a live database, so this
   * runs in the unit suite alongside the rules it is checking.
   */
  it("keeps the allowance rule in step", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("chork_allowance");

    // The bonus is grades-above-ceiling, floored at zero…
    expect(body).toMatch(/greatest\(0,\s*p_challenge_grade - p_ceiling\)/);
    // …the base is the setter's count, floored at one…
    expect(body).toMatch(/greatest\(coalesce\(p_setter_attempts, 0\), 1\)/);
    // …and an unknown on either side buys nothing.
    expect(body).toMatch(/p_challenge_grade is null or p_ceiling is null then 0/);
  });

  it("keeps the letter rule in step", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("chork_is_letter");

    // The whole subtlety in one clause: safe means sent WITHIN the
    // allowance, so a send afterwards can't erase the letter.
    expect(body).toMatch(/not \(coalesce\(p_completed, false\) and coalesce\(p_attempts, 0\) <= p_allowance\)/);
    expect(body).toMatch(/coalesce\(p_attempts, 0\) >= p_allowance/);
  });
});
