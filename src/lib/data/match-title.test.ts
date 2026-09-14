import { describe, expect, it } from "vitest";
import { matchTitle } from "./match-title";

describe("matchTitle", () => {
  it("uses the stored name", () => {
    expect(matchTitle({ name: "Friday sesh" })).toBe("Friday sesh");
  });
  it("trims it", () => {
    expect(matchTitle({ name: "  Friday sesh " })).toBe("Friday sesh");
  });
  it("falls back for legacy rows with no name", () => {
    expect(matchTitle({ name: null })).toBe("Untitled match");
    expect(matchTitle({ name: "   " })).toBe("Untitled match");
  });
});
