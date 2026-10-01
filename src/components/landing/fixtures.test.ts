import { describe, it, expect } from "vitest";
import { computePoints } from "@/lib/data";
import { CLIMBERS, GAME, ROUTES, SET, TAPPED_ROUTE, YOU, YOUR_LOGS, YOUR_RANK } from "./fixtures";

describe("marketing fixtures", () => {
  it("only you have logs — nobody else's attempt count exists to leak", () => {
    for (const l of YOUR_LOGS) expect(l.user_id).toBe(YOU.id);
    for (const l of GAME.yourLogs) expect(l).not.toHaveProperty("user_id");
  });

  it("board entries carry points and flashes, never attempts", () => {
    for (const c of CLIMBERS) expect(c).not.toHaveProperty("attempts");
    for (const r of GAME.board) expect(r).not.toHaveProperty("attempts");
  });

  it("your card adds up to the rank strip's points and flashes", () => {
    const points = YOUR_LOGS.reduce((n, l) => n + computePoints(l), 0);
    const flashes = YOUR_LOGS.filter((l) => l.attempts === 1 && l.completed).length;
    expect(points).toBe(YOUR_RANK.points);
    expect(flashes).toBe(YOUR_RANK.flashes);
    expect(CLIMBERS.find((c) => c.user_id === YOU.id)?.points).toBe(YOUR_RANK.points);
  });

  it("the rank strip's gap to the place above is the board's", () => {
    const above = CLIMBERS.find((c) => c.rank === (YOUR_RANK.rank ?? 0) - 1);
    expect(YOUR_RANK.toNext?.rank).toBe(above?.rank);
    expect(YOUR_RANK.toNext?.points).toBe((above?.points ?? 0) - YOUR_RANK.points + 1);
  });

  it("the tapped route exists, belongs to the set and is untouched", () => {
    expect(ROUTES.some((r) => r.number === TAPPED_ROUTE && r.set_id === SET.id)).toBe(true);
    expect(YOUR_LOGS.some((l) => l.route_id === `route_${TAPPED_ROUTE}`)).toBe(false);
  });

  it("the board is in rank order and you are third — on the podium", () => {
    CLIMBERS.forEach((c, i) => expect(c.rank).toBe(i + 1));
    expect(CLIMBERS[2].user_id).toBe(YOU.id);
    expect(YOUR_RANK.rank).toBe(3);
  });

  it("names no real gym", () => {
    const text = JSON.stringify({ SET, GAME });
    expect(text).not.toMatch(/depot|yonder|climbing works|the arch|castle|biscuit|boulder(ing)? (hut|shed|central)/i);
  });
});
