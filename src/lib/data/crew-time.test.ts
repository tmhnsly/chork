import { describe, it, expect } from "vitest";
import { relativeDay } from "./crew-time";

// relativeDay is the privacy-critical formatter for the crew activity
// feed. These tests pin the behaviour so a future refactor can't
// accidentally expose clock-time, hours, or under-a-day resolution.
// The "now" reference is always fixed so the tests are deterministic.

const NOON_TODAY = new Date("2026-05-10T12:00:00Z");

describe("relativeDay", () => {
  it("returns 'today' for same-day events earlier in the day", () => {
    expect(relativeDay("2026-05-10T00:30:00Z", NOON_TODAY)).toBe("today");
    expect(relativeDay("2026-05-10T11:59:00Z", NOON_TODAY)).toBe("today");
  });

  it("returns 'today' for events later on the same UTC day", () => {
    // Climber logged in the evening; we're checking earlier in the day
    // — still the same UTC day so "today".
    expect(relativeDay("2026-05-10T23:59:00Z", NOON_TODAY)).toBe("today");
  });

  it("returns 'yesterday' exactly one UTC day ago", () => {
    expect(relativeDay("2026-05-09T12:00:00Z", NOON_TODAY)).toBe("yesterday");
    expect(relativeDay("2026-05-09T00:00:00Z", NOON_TODAY)).toBe("yesterday");
    expect(relativeDay("2026-05-09T23:59:00Z", NOON_TODAY)).toBe("yesterday");
  });

  it("returns 'N days ago' for 2..30 days back", () => {
    expect(relativeDay("2026-05-08T12:00:00Z", NOON_TODAY)).toBe("2 days ago");
    expect(relativeDay("2026-05-03T12:00:00Z", NOON_TODAY)).toBe("7 days ago");
    // 30 days ago exactly — still in the bounded range
    expect(relativeDay("2026-04-10T12:00:00Z", NOON_TODAY)).toBe("30 days ago");
  });

  it("returns 'over a month ago' for anything older than 30 days", () => {
    expect(relativeDay("2026-04-09T12:00:00Z", NOON_TODAY)).toBe("over a month ago");
    expect(relativeDay("2024-01-01T12:00:00Z", NOON_TODAY)).toBe("over a month ago");
  });

  it("never exposes clock time, hours, or minutes (privacy contract)", () => {
    // Every output should be lowercase words, no colons, no digits in
    // the 0..23 range presented as time of day.
    const cases = [
      relativeDay("2026-05-10T09:15:00Z", NOON_TODAY),
      relativeDay("2026-05-09T14:45:00Z", NOON_TODAY),
      relativeDay("2026-04-20T03:22:00Z", NOON_TODAY),
      relativeDay("2024-12-31T23:59:00Z", NOON_TODAY),
    ];
    for (const out of cases) {
      expect(out).not.toMatch(/\d{1,2}:\d{2}/);
      expect(out).not.toMatch(/\bhour[s]?\b/i);
      expect(out).not.toMatch(/\bminute[s]?\b/i);
      expect(out).not.toMatch(/\b(am|pm)\b/i);
    }
  });

  it("handles a future timestamp as 'today' rather than throwing", () => {
    // Server clocks drift; a feed row's updated_at could briefly be
    // ahead of the client. Don't break the UI in that case.
    expect(relativeDay("2026-05-11T00:00:00Z", NOON_TODAY)).toBe("today");
  });
});
