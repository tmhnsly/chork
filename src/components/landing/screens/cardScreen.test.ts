import { describe, it, expect } from "vitest";
import { deriveTileState } from "@/lib/data";
import { TAPPED_ROUTE, YOUR_LOGS, YOUR_RANK } from "../fixtures";
import { CARD_STEPS, cardScreenAt } from "./cardScreen";

const tapped = `route_${TAPPED_ROUTE}`;

describe("cardScreenAt", () => {
  it("step 0 is your card as it stands: sheet closed, tapped route empty", () => {
    const s = cardScreenAt(0);
    expect(s.sheet).toBeNull();
    expect(deriveTileState(s.logs.get(tapped))).toBe("empty");
    expect(s.logs.size).toBe(YOUR_LOGS.length);
    expect(s.rank).toEqual(YOUR_RANK);
  });

  it("step 1 opens the sheet on the tapped route with one attempt", () => {
    const s = cardScreenAt(1);
    expect(s.sheet).toEqual({ attempts: 1, completed: false });
    expect(deriveTileState(s.logs.get(tapped))).toBe("attempted");
  });

  it("step 2 adds a second attempt", () => {
    expect(cardScreenAt(2).sheet).toEqual({ attempts: 2, completed: false });
  });

  it("step 3 marks it sent, sheet still open", () => {
    const s = cardScreenAt(3);
    expect(s.sheet).toEqual({ attempts: 2, completed: true });
    expect(deriveTileState(s.logs.get(tapped))).toBe("completed");
  });

  it("step 4 closes the sheet; the tile stays sent and the rank strip has moved", () => {
    const s = cardScreenAt(4);
    expect(s.sheet).toBeNull();
    expect(deriveTileState(s.logs.get(tapped))).toBe("completed");
    expect(s.rank.points).toBe(YOUR_RANK.points + 3);
    expect(s.rank.rank).toBe((YOUR_RANK.rank ?? 0) - 1);
  });

  it("the last step is the end state, and steps beyond it are the same", () => {
    expect(cardScreenAt(CARD_STEPS - 1)).toEqual(cardScreenAt(4));
    expect(cardScreenAt(99)).toEqual(cardScreenAt(4));
  });

  it("never touches any log but the tapped route's", () => {
    for (let step = 0; step < CARD_STEPS; step++) {
      const s = cardScreenAt(step);
      for (const l of YOUR_LOGS) expect(s.logs.get(l.route_id)).toEqual(l);
    }
  });
});
