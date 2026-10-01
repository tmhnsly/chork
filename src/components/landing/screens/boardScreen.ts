import type { LeaderboardEntry } from "@/lib/data";
import { CLIMBERS, YOU } from "../fixtures";

/**
 * "See where you stand": you start third, on the podium, and climb a
 * place per step — across it to second, then up to first — your
 * points rising with each. Each step is a whole board, re-ranked; the
 * component moves every climber to their new slot and never has to
 * work out who moved.
 */
export const BOARD_STEPS = 3;

export interface BoardScreenState {
  entries: LeaderboardEntry[];
}

/**
 * The points that put you one above the climber currently in the
 * place above: a send with the zone (5) takes you from 25 past
 * second at 27, then a flash with the zone (5) past first at 33.
 */
const YOUR_POINTS_AT_STEP = (base: number) => [base, base + 5, base + 10];

export function boardScreenAt(step: number): BoardScreenState {
  const s = Math.max(0, Math.min(BOARD_STEPS - 1, step));
  const you = CLIMBERS.find((c) => c.user_id === YOU.id);
  if (!you) throw new Error("fixture: you are not on the board");

  const yours = YOUR_POINTS_AT_STEP(you.points)[s];
  const flashes = you.flashes + (s === 2 ? 1 : 0);
  const sends = you.sends + s;
  const zones = you.zones + s;

  const entries = CLIMBERS.map((c) =>
    c.user_id === YOU.id ? { ...c, points: yours, flashes, sends, zones } : c,
  )
    .sort((a, b) => b.points - a.points || b.flashes - a.flashes)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  return { entries };
}
