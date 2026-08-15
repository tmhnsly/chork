import { describe, it, expect } from "vitest";
import { plural, countOf, countOfFormatted } from "./plural";

describe("plural", () => {
  it("singularises exactly one", () => {
    expect(plural(1, "send")).toBe("send");
    expect(plural(0, "send")).toBe("sends");
    expect(plural(2, "send")).toBe("sends");
  });

  it("takes an explicit plural for irregular words", () => {
    expect(plural(1, "flash", "flashes")).toBe("flash");
    expect(plural(3, "flash", "flashes")).toBe("flashes");
  });
});

describe("countOf", () => {
  it("keeps the number and its noun in agreement", () => {
    expect(countOf(1, "route")).toBe("1 route");
    expect(countOf(7, "route")).toBe("7 routes");
  });
});

describe("countOfFormatted", () => {
  it("reads an already-formatted total", () => {
    // Handicapped points arrive as strings, formatted from tenths.
    expect(countOfFormatted("1", "point")).toBe("1 point");
    expect(countOfFormatted("2.8", "point")).toBe("2.8 points");
    expect(countOfFormatted(1, "point")).toBe("1 point");
  });

  it("treats an unparseable value as plural", () => {
    expect(countOfFormatted("—", "point")).toBe("— points");
  });
});

/**
 * The words Chork actually counts, with the form each one takes.
 *
 * This is a list, not a rule: `+s` is wrong for the -sh/-ch words, and
 * the only defence against a caller forgetting is that every noun the
 * app counts is written down here once. A new count noun that isn't
 * regular belongs in this table.
 */
describe("the nouns Chork counts", () => {
  it("pluralises each one correctly", () => {
    const cases: Array<[string, string | undefined, string]> = [
      ["send", undefined, "sends"],
      ["route", undefined, "routes"],
      ["climber", undefined, "climbers"],
      ["player", undefined, "players"],
      ["member", undefined, "members"],
      ["attempt", undefined, "attempts"],
      ["point", undefined, "points"],
      ["invite", undefined, "invites"],
      ["crew", undefined, "crews"],
      ["gym", undefined, "gyms"],
      ["set", undefined, "sets"],
      ["day", undefined, "days"],
      // Irregular — a bare +s would give "flashs" / "matchs".
      ["flash", "flashes", "flashes"],
      ["match", "matches", "matches"],
    ];

    for (const [singular, explicit, expected] of cases) {
      expect(plural(1, singular, explicit)).toBe(singular);
      expect(plural(2, singular, explicit)).toBe(expected);
    }
  });
});
