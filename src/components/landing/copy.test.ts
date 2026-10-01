import { describe, it, expect } from "vitest";
import * as copy from "./copy";

/** Every string reachable from the copy module, flattened. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const ALL = strings(copy);

describe("marketing copy", () => {
  it("has something to check", () => {
    expect(ALL.length).toBeGreaterThan(20);
  });

  it('says "game" or "competition", never "match"', () => {
    expect(ALL.filter((s) => /\bmatch(es)?\b/i.test(s))).toEqual([]);
  });

  it("makes no permanence promise about the price", () => {
    expect(ALL.filter((s) => /forever|always free|for life|free for good/i.test(s))).toEqual([]);
  });

  it('says "leaderboard", never "Chorkboard"', () => {
    expect(ALL.filter((s) => /chorkboard/i.test(s))).toEqual([]);
  });

  it("headlines are short plain statements — one line, no colon, no dash", () => {
    const headlines = [
      copy.HERO.headline, copy.LOG.headline, copy.LADDER.headline, copy.BOARD.headline,
      copy.ANYWHERE.headline, copy.QUIET.headline, copy.CONTACT.headline, copy.CLOSE.headline,
    ];
    for (const h of headlines) {
      expect(h.length, h).toBeLessThanOrEqual(48);
      expect(h, h).not.toMatch(/[:;—]/);
    }
  });
});
