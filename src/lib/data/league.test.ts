import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEAGUE_LADDER,
  countingWeeks,
  describeDropRule,
  dropsFor,
  placementPoints,
  weekLabel,
} from "./league";

describe("placementPoints", () => {
  it("pays the ladder, then 1 for every further place", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 40].map(placementPoints)).toEqual([
      10, 8, 6, 5, 4, 3, 2, 1, 1, 1,
    ]);
  });

  it("pays nothing for no placing", () => {
    expect(placementPoints(0)).toBe(0);
    expect(placementPoints(-3)).toBe(0);
    expect(placementPoints(Number.NaN)).toBe(0);
  });
});

describe("dropsFor", () => {
  it("drops nothing below four weeks, one from four, two from eight", () => {
    expect([0, 1, 2, 3, 4, 5, 7, 8, 12, 30].map(dropsFor)).toEqual([
      0, 0, 0, 0, 1, 1, 1, 2, 2, 2,
    ]);
  });

  it("counts the weeks that remain", () => {
    expect(countingWeeks(3)).toBe(3);
    expect(countingWeeks(4)).toBe(3);
    expect(countingWeeks(8)).toBe(6);
  });
});

describe("describeDropRule", () => {
  it("says what applies now, in one line", () => {
    expect(describeDropRule(2)).toBe("Every week counts.");
    expect(describeDropRule(3)).toBe("Every week counts. From 4 weeks your lowest is dropped.");
    expect(describeDropRule(5)).toBe("Best 4 of 5 count — your lowest week is dropped.");
    expect(describeDropRule(8)).toBe("Best 6 of 8 count — your lowest two weeks are dropped.");
  });
});

describe("weekLabel", () => {
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

  it("numbers archived weeks oldest-first even though the list is newest-first", () => {
    // Three weeks, list order newest → oldest: index 0 is week 3.
    expect(weekLabel(week({}), 0, 3)).toBe("Week 3");
    expect(weekLabel(week({}), 2, 3)).toBe("Week 1");
  });

  it("calls a live one 'this week'", () => {
    expect(weekLabel(week({ status: "live", ends_at: null }), 0, 3)).toBe("This week — in progress");
  });
});

/**
 * The two rules live in SQL too (`league_placement_points`,
 * `league_drops` in migration 134) — that is where the table is
 * actually computed. This is the TS mirror for the legend and the
 * copy; pin the two equal so a change to one can't ship alone. Same
 * convention as `compute_points`.
 */
describe("parity with migration 134", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/134_league_placings.sql"),
    "utf8",
  );

  it("league_placement_points matches LEAGUE_LADDER", () => {
    const body = sql.slice(
      sql.indexOf("function public.league_placement_points"),
      sql.indexOf("function public.league_drops"),
    );
    const cases = [...body.matchAll(/when p_rank = (\d+) then (\d+)/g)].map(
      ([, rank, pts]) => [Number(rank), Number(pts)] as const,
    );
    expect(cases.map(([rank]) => rank)).toEqual(LEAGUE_LADDER.map((_, i) => i + 1));
    expect(cases.map(([, pts]) => pts)).toEqual([...LEAGUE_LADDER]);
    expect(body).toMatch(/else 1\s*\n\s*end/);
  });

  it("league_drops matches dropsFor", () => {
    const body = sql.slice(
      sql.indexOf("function public.league_drops"),
      sql.indexOf("-- ── The one home for a week's board"),
    );
    const cases = [...body.matchAll(/when p_weeks >= (\d+) then (\d+)/g)].map(
      ([, weeks, drops]) => [Number(weeks), Number(drops)] as const,
    );
    expect(cases).toEqual([[8, 2], [4, 1]]);
    for (const [weeks, drops] of cases) {
      expect(dropsFor(weeks)).toBe(drops);
      expect(dropsFor(weeks - 1)).toBe(drops - 1);
    }
  });
});
