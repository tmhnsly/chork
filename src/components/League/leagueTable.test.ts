import { describe, expect, it } from "vitest";
import { weekLabel } from "./LeagueWeekList";

const week = (overrides: Partial<Parameters<typeof weekLabel>[0]>) => ({
  set_id: "s",
  name: null,
  status: "archived" as const,
  game_mode: "points" as const,
  starts_at: "2026-08-04T18:00:00.000Z",
  ends_at: "2026-08-04T20:00:00.000Z",
  player_count: 4,
  winner_user_id: null,
  ...overrides,
});

describe("weekLabel", () => {
  it("numbers archived weeks oldest-first even though the list is newest-first", () => {
    // Three weeks, list order newest → oldest: index 0 is week 3.
    expect(weekLabel(week({}), 0, 3)).toBe("Week 3");
    expect(weekLabel(week({}), 2, 3)).toBe("Week 1");
  });

  it("calls a live one 'this week'", () => {
    expect(weekLabel(week({ status: "live", ends_at: null }), 0, 3)).toBe("This week — in progress");
  });
});
