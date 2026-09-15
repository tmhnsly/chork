import { describe, expect, it } from "vitest";
import { defaultGameName, matchTitle } from "./match-title";

describe("matchTitle", () => {
  it("uses the stored name", () => {
    expect(matchTitle({ name: "Friday sesh" })).toBe("Friday sesh");
  });
  it("trims it", () => {
    expect(matchTitle({ name: "  Friday sesh " })).toBe("Friday sesh");
  });
  it("falls back for legacy rows with no name", () => {
    expect(matchTitle({ name: null })).toBe("Untitled game");
    expect(matchTitle({ name: "   " })).toBe("Untitled game");
  });
});

describe("defaultGameName", () => {
  // The setup page prefills this, so a climber who changes nothing still
  // starts a game with a name every list can show.
  it("names the game after the climber's first name", () => {
    expect(defaultGameName({ name: "Tom Hinsley", username: "tom" })).toBe("Tom's game");
  });
  it("falls back to the username when there is no name", () => {
    expect(defaultGameName({ name: "  ", username: "elmo" })).toBe("elmo's game");
    expect(defaultGameName({ name: null, username: "elmo" })).toBe("elmo's game");
  });
  it("says My game when there is nothing to name it after", () => {
    expect(defaultGameName({ name: null, username: null })).toBe("My game");
    expect(defaultGameName(null)).toBe("My game");
  });
});
