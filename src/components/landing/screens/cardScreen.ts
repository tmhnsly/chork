import type { RouteLog } from "@/lib/data";
import type { MyRank } from "@/app/(app)/rank-actions";
import { mockRouteLog } from "@/test/mocks";
import { SET, TAPPED_ROUTE, YOU, YOUR_LOGS, YOUR_RANK } from "../fixtures";

/**
 * "Log a send in two taps", as five states the reader scrolls through:
 *   0  the card as it stands
 *   1  route 4 tapped — sheet open, one attempt
 *   2  a second attempt
 *   3  marked as sent (a send in two goes: 3 points)
 *   4  sheet closed, tile green, rank strip up one place
 * A pure function of the step so every state is a unit test, and the
 * component that renders it decides nothing.
 */
export const CARD_STEPS = 5;

export type SheetState = { attempts: number; completed: boolean } | null;

export interface CardScreenState {
  logs: Map<string, RouteLog>;
  sheet: SheetState;
  rank: MyRank;
}

const TAPPED_ID = `route_${TAPPED_ROUTE}`;

const BASE = new Map(YOUR_LOGS.map((l) => [l.route_id, l]));

const SENT_POINTS = 3; // computePoints({ attempts: 2, completed: true, zone: false })

function tappedLog(attempts: number, completed: boolean): RouteLog {
  return mockRouteLog({
    id: "log_tapped",
    user_id: YOU.id,
    route_id: TAPPED_ID,
    set_id: SET.id,
    gym_id: SET.gym_id,
    attempts,
    completed,
  });
}

export function cardScreenAt(step: number): CardScreenState {
  const s = Math.max(0, Math.min(CARD_STEPS - 1, step));
  if (s === 0) return { logs: new Map(BASE), sheet: null, rank: YOUR_RANK };

  const attempts = s === 1 ? 1 : 2;
  const completed = s >= 3;
  const logs = new Map(BASE).set(TAPPED_ID, tappedLog(attempts, completed));

  if (s < 4) return { logs, sheet: { attempts, completed }, rank: YOUR_RANK };

  const rank: MyRank = {
    ...YOUR_RANK,
    rank: (YOUR_RANK.rank ?? 1) - 1,
    points: YOUR_RANK.points + SENT_POINTS,
    // 28 points now, second; first is at 33, so 6 to pass.
    toNext: { rank: (YOUR_RANK.rank ?? 1) - 2, points: 6 },
  };
  return { logs, sheet: null, rank };
}
