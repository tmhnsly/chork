import { describe, it, expect } from "vitest";
import { formatError } from "./errors";

describe("formatError", () => {
  it("formats a Supabase PostgrestError", () => {
    const err = {
      code: "23505",
      message: "duplicate key value",
      details: "Key already exists",
      hint: "debug hint",
    };
    const result = formatError(err);
    expect(result).toContain("duplicate key value");
    expect(result).toContain("Key already exists");
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
