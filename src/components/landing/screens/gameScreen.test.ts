import { describe, it, expect } from "vitest";
import { GAME, YOU } from "../fixtures";
import { GAME_STEPS, gameScreenAt } from "./gameScreen";

describe("gameScreenAt", () => {
  it("step 0: four sent, route 5 untouched, you second", () => {
    const s = gameScreenAt(0);
    expect(s.tiles.map((t) => t.state)).toEqual(["flash", "completed", "flash", "completed", "empty", "empty"]);
    expect(s.rows[1].userId).toBe(YOU.id);
    expect(s.rows[1].rank).toBe(2);
  });

  it("step 1: route 5 flashed and you take first", () => {
    const s = gameScreenAt(1);
    expect(s.tiles[4].state).toBe("flash");
    expect(s.rows[0].userId).toBe(YOU.id);
    expect(s.rows[0].rank).toBe(1);
    expect(s.rows[0].points).toBe(GAME.board[1].points + 4);
    expect(s.rows[0].flashes).toBe(GAME.board[1].flashes + 1);
  });

  it("grade labels ride the tiles", () => {
    expect(gameScreenAt(0).tiles.map((t) => t.gradeLabel)).toEqual(GAME.routes.map((r) => r.grade));
  });

  it("rows are dense-ranked in points order at every step", () => {
    for (let step = 0; step < GAME_STEPS; step++) {
      const { rows } = gameScreenAt(step);
      rows.forEach((r, i) => expect(r.rank).toBe(i + 1));
      for (let i = 1; i < rows.length; i++) expect(Number(rows[i - 1].points)).toBeGreaterThan(Number(rows[i].points));
    }
  });

  it("steps beyond the last are the end state", () => {
    expect(gameScreenAt(9)).toEqual(gameScreenAt(GAME_STEPS - 1));
  });
});
