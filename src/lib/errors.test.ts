import { describe, it, expect } from "vitest";
import { formatError } from "./errors";

describe("formatError", () => {
  it("maps a known PostgrestError code to a friendly message", () => {
    const err = {
      code: "23505",
      message: "duplicate key value",
      details: "Key (username)=(alice) already exists",
      hint: "secret hint",
    };
    // 23505 → "That already exists." — never leaks the column / value.
    expect(formatError(err)).toBe("That already exists.");
  });

  it("falls back to message-only on unknown codes", () => {
    const err = {
      code: "99999",
      message: "some db error",
      details: "private detail",
      hint: "private hint",
    };
    const result = formatError(err);
    // No leak of details or hint in production-shaped output.
    expect(result).not.toContain("private detail");
    expect(result).not.toContain("private hint");
  });

  it("formats a standard Error", () => {
    expect(formatError(new Error("something broke"))).toBe("something broke");
  });

  it("returns fallback for unknown types", () => {
    expect(formatError(null)).toBe("Something went wrong");
    expect(formatError(undefined)).toBe("Something went wrong");
    expect(formatError(42)).toBe("Something went wrong");
    expect(formatError("string error")).toBe("Something went wrong");
  });
});
