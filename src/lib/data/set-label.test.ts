import { describe, it, expect } from "vitest";
import { formatSetLabel } from "./set-label";

describe("formatSetLabel", () => {
  it("prefers an explicit name when present", () => {
    expect(
      formatSetLabel({
        name: "Spring Comp 2026",
        starts_at: "2026-04-01T00:00:00Z",
        ends_at: "2026-04-30T00:00:00Z",
      })
    ).toBe("Spring Comp 2026");
  });

  it("falls back to the date range when name is null", () => {
    expect(
      formatSetLabel({
        name: null,
        starts_at: "2026-04-01T00:00:00Z",
        ends_at: "2026-04-30T00:00:00Z",
      })
    ).toBe("APR 1 – APR 30");
  });

  it("falls back to the date range when name is an empty/whitespace string", () => {
    expect(
      formatSetLabel({
        name: "   ",
        starts_at: "2026-04-01T00:00:00Z",
        ends_at: "2026-04-30T00:00:00Z",
      })
    ).toBe("APR 1 – APR 30");
  });

  it("trims whitespace around an explicit name", () => {
    expect(
      formatSetLabel({
        name: "  Spring Comp  ",
        starts_at: "2026-04-01T00:00:00Z",
        ends_at: "2026-04-30T00:00:00Z",
      })
    ).toBe("Spring Comp");
  });

  it("handles same-day single-event sets", () => {
    expect(
      formatSetLabel({
        name: null,
        starts_at: "2026-04-15T10:00:00Z",
        ends_at: "2026-04-15T22:00:00Z",
      })
    ).toBe("APR 15 – APR 15");
  });
});
