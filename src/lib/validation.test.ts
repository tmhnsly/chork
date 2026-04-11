import { describe, it, expect } from "vitest";
import { USERNAME_RE, validateUsername } from "./validation";

describe("USERNAME_RE", () => {
  it("matches valid usernames", () => {
    expect(USERNAME_RE.test("tom")).toBe(true);
    expect(USERNAME_RE.test("climb_king_99")).toBe(true);
    expect(USERNAME_RE.test("abc")).toBe(true);
    expect(USERNAME_RE.test("a".repeat(24))).toBe(true);
  });

  it("rejects invalid usernames", () => {
    expect(USERNAME_RE.test("ab")).toBe(false);           // too short
    expect(USERNAME_RE.test("a".repeat(25))).toBe(false); // too long
    expect(USERNAME_RE.test("Tom")).toBe(false);           // uppercase
    expect(USERNAME_RE.test("tom!")).toBe(false);          // special char
    expect(USERNAME_RE.test("tom hensley")).toBe(false);   // space
    expect(USERNAME_RE.test("")).toBe(false);              // empty
  });
});

describe("validateUsername", () => {
  it("returns no error for valid username", () => {
    expect(validateUsername("tom")).toEqual({});
    expect(validateUsername("climb_99")).toEqual({});
  });

  it("returns error for empty", () => {
    expect(validateUsername("")).toEqual({ error: "Username is required" });
  });

  it("returns error for too short", () => {
    expect(validateUsername("ab")).toEqual({ error: "Username must be at least 3 characters" });
  });

  it("returns error for too long", () => {
    expect(validateUsername("a".repeat(25))).toEqual({ error: "Username must be 24 characters or fewer" });
  });

  it("returns error for invalid characters", () => {
    expect(validateUsername("TOM")).toEqual({ error: "Lowercase letters, numbers, and underscores only" });
    expect(validateUsername("tom!")).toEqual({ error: "Lowercase letters, numbers, and underscores only" });
  });
});
