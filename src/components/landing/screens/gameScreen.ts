import type { TileState } from "@/lib/data";
import { deriveTileState } from "@/lib/data";
import type { LeaderboardRowData } from "@/components/ui";
import { GAME, YOU } from "../fixtures";

/**
 * "Run your own competition, anywhere": one state change on arrival.
 * Route 5 goes from untouched to flashed, and the four points take
 * you from second to first.
 */
export const GAME_STEPS = 2;

export interface GameScreenState {
  tiles: Array<{ number: number; state: TileState; gradeLabel: string }>;
  rows: LeaderboardRowData[];
}

const WINNING_ROUTE = 5;
const FLASH_POINTS = 4;

export function gameScreenAt(step: number): GameScreenState {
  const s = Math.max(0, Math.min(GAME_STEPS - 1, step));

  const tiles = GAME.routes.map((r) => {
    const log = GAME.yourLogs.find((l) => l.number === r.number) ?? null;
    const state: TileState =
      s === 1 && r.number === WINNING_ROUTE ? "flash" : deriveTileState(log);
    return { number: r.number, state, gradeLabel: r.grade };
  });

  const rows = GAME.board
    .map((r) =>
      r.userId === YOU.id && s === 1
        ? { ...r, points: r.points + FLASH_POINTS, flashes: r.flashes + 1 }
        : r,
    )
    .sort((a, b) => b.points - a.points || b.flashes - a.flashes)
    .map((r, i): LeaderboardRowData => ({
      userId: r.userId,
      username: r.username,
      name: r.name,
      avatarUrl: "",
      rank: i + 1,
      points: r.points,
      flashes: r.flashes,
    }));

  return { tiles, rows };
}
