import { describe, it, expect } from "vitest";
import { CLIMBERS, YOU } from "../fixtures";
import { BOARD_STEPS, boardScreenAt } from "./boardScreen";

const yourRank = (step: number) => boardScreenAt(step).entries.find((e) => e.user_id === YOU.id)?.rank;

describe("boardScreenAt", () => {
  it("step 0 is the board as it stands", () => {
    expect(boardScreenAt(0).entries).toEqual(CLIMBERS);
  });

  it("you climb one place per step: third, second, first", () => {
    expect(yourRank(0)).toBe(3);
    expect(yourRank(1)).toBe(2);
    expect(yourRank(2)).toBe(1);
  });

  it("every step is a whole board in rank order with dense ranks", () => {
    for (let step = 0; step < BOARD_STEPS; step++) {
      const { entries } = boardScreenAt(step);
      expect(entries).toHaveLength(CLIMBERS.length);
      entries.forEach((e, i) => expect(e.rank).toBe(i + 1));
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i - 1].points).toBeGreaterThan(entries[i].points);
      }
    }
  });

  it("only your points change — everyone else keeps theirs", () => {
    for (let step = 0; step < BOARD_STEPS; step++) {
      for (const c of CLIMBERS) {
        if (c.user_id === YOU.id) continue;
        const now = boardScreenAt(step).entries.find((e) => e.user_id === c.user_id);
        expect(now?.points).toBe(c.points);
        expect(now?.flashes).toBe(c.flashes);
      }
    }
  });

  it("nobody on the board carries an attempt count", () => {
    for (const e of boardScreenAt(BOARD_STEPS - 1).entries) expect(e).not.toHaveProperty("attempts");
  });

  it("steps beyond the last are the end state", () => {
    expect(boardScreenAt(99)).toEqual(boardScreenAt(BOARD_STEPS - 1));
  });
});
