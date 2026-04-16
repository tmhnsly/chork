import { describe, it, expect } from "vitest";
import {
  USERNAME_RE,
  validateUsername,
  UUID_RE,
  isUuid,
  escapeLikePattern,
} from "./validation";

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

describe("UUID_RE", () => {
  it("matches v4-shaped UUIDs", () => {
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(UUID_RE.test("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("matches uppercase + mixed case", () => {
    expect(UUID_RE.test("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    expect(UUID_RE.test("550e8400-E29B-41d4-A716-446655440000")).toBe(true);
  });

  it("rejects malformed shapes", () => {
    expect(UUID_RE.test("550e8400e29b41d4a716446655440000")).toBe(false); // no dashes
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-44665544000")).toBe(false); // short
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-4466554400000")).toBe(false); // long
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-44665544000g")).toBe(false); // non-hex
    expect(UUID_RE.test("")).toBe(false);
    expect(UUID_RE.test("not-a-uuid")).toBe(false);
  });

  it("rejects when surrounded by extra characters (anchored)", () => {
    // Defends against open-ended matchers leaking into queries
    expect(UUID_RE.test("xxx550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-446655440000xxx")).toBe(false);
  });
});

describe("isUuid", () => {
  it("narrows non-string inputs to false", () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid({ id: "550e8400-e29b-41d4-a716-446655440000" })).toBe(false);
  });

  it("matches the same shapes as UUID_RE", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("escapeLikePattern", () => {
  it("escapes %, _, and \\ in user input", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("_a")).toBe("\\_a");
    expect(escapeLikePattern("path\\back")).toBe("path\\\\back");
  });

  it("escapes backslash before wildcards (order matters)", () => {
    // If \ wasn't doubled first, escaping % would produce \% which
    // would then get caught by the backslash-escape pass and become
    // \\% — broken. Order check.
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("returns unchanged input that has no metacharacters", () => {
    expect(escapeLikePattern("Yonder Climbing")).toBe("Yonder Climbing");
    expect(escapeLikePattern("")).toBe("");
  });

  it("handles consecutive metacharacters", () => {
    expect(escapeLikePattern("%%")).toBe("\\%\\%");
    expect(escapeLikePattern("___")).toBe("\\_\\_\\_");
  });
});
