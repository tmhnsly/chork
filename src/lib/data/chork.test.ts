import { describe, it, expect } from "vitest";
import { playerState, CHORK_OUT_AT } from "./chork";

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

// ── The rules, where they actually live ─────────────────────────

/**
 * Chork's arithmetic has one home — SQL — because every rule needs a
 * raw attempt count belonging to someone else (see the header of
 * `chork.ts`). There is no TS twin to compare against, so these read
 * the migration text and pin the two clauses that are subtle enough
 * to be "simplified" away by someone who hasn't played the game.
 *
 * `latestDefinition` reads the most recent migration defining each
 * function, so a later migration that rewrites one of these rules
 * fails here — which is the point. Changing the rule is allowed;
 * changing it without noticing is not.
 */
describe("the SQL rules", () => {
  it("scales the allowance by grades above your limit", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("chork_allowance");

    // The bonus is grades-above-ceiling, floored at zero…
    expect(body).toMatch(/greatest\(0,\s*p_challenge_grade - p_ceiling\)/);
    // …the base is the setter's count, floored at one (a setter's log
    // can read 0 mid-edit; nobody gets zero goes)…
    expect(body).toMatch(/greatest\(coalesce\(p_setter_attempts, 0\), 1\)/);
    // …and an unknown on either side buys nothing, because guessing is
    // worse than not helping.
    expect(body).toMatch(/p_challenge_grade is null or p_ceiling is null then 0/);
  });

  it("won't let a late send erase a letter already earned", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("chork_is_letter");

    // The whole subtlety in one clause: safe means sent WITHIN the
    // allowance, not "sent". A climber who burns their three goes,
    // keeps pulling and tops out on the fourth does not get the letter
    // back — which a plain `not completed` test would hand them.
    expect(body).toMatch(
      /not \(coalesce\(p_completed, false\) and coalesce\(p_attempts, 0\) <= p_allowance\)/,
    );
    expect(body).toMatch(/coalesce\(p_attempts, 0\) >= p_allowance/);
  });

  it("keeps the pen until the setter takes the challenge back", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("chork_standings");

    // The pen is a column on the standings, not a client-side guess —
    // it needs the setter's own attempt count, which is private.
    expect(body).toMatch(/has_pen boolean/);
    // Withdrawal is what moves it, NOT "hasn't sent it yet". Reading
    // an unsent challenge as a failed one took the pen off you the
    // instant you put a route up, while you were still tying in
    // (migration 114) — so the rule turns on `was_withdrawn`.
    expect(body).toMatch(/was_withdrawn/);
    expect(body).not.toMatch(/was_sent/);
    // And a withdrawn challenge is not a round, so it costs no letter.
    expect(body).toMatch(/r\.withdrawn_at is null/);
    // Out players don't set either, so rotation runs over `eligible`.
    expect(body).toMatch(/t\.letters < 5/);
  });
});
