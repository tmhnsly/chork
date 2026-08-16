"use server";

import { requireAuth } from "@/lib/auth";
import { getCurrentSet } from "@/lib/data/set-queries";
import {
  getLeaderboardUserRow,
  getGymStatsV2Cached,
} from "@/lib/data/leaderboard-queries";

/**
 * Where the caller currently stands on their gym's live Set.
 *
 * Exists because the rank strip has to move the moment you log a send,
 * and `completeRoute` busts cache TAGS rather than re-rendering the
 * page you're standing on — the grid updates optimistically, the
 * server render doesn't. Rank can't be derived client-side (it depends
 * on everyone else), so the strip asks.
 *
 * Cheap on purpose: `get_leaderboard_user_row` is a single indexed
 * lookup and the climber count comes from the cached gym-stats RPC,
 * shared across every viewer of the gym. Nothing here fetches a board.
 */
export interface MyRank {
  /** Null when they haven't scored on this Set yet. */
  rank: number | null;
  points: number;
  /** Everyone with at least one send on this Set — the "of 51". */
  climberCount: number;
}

export async function fetchMyRank(): Promise<MyRank | null> {
  const auth = await requireAuth();
  if ("error" in auth) return null;

  const { supabase, userId, gymId } = auth;
  const set = await getCurrentSet(gymId);
  if (!set) return null;

  const [row, stats] = await Promise.all([
    getLeaderboardUserRow(supabase, gymId, userId, set.id),
    getGymStatsV2Cached(gymId, set.id),
  ]);

  return {
    rank: row?.rank ?? null,
    points: row?.points ?? 0,
    // `set` is null when the gym has no live Set — but we returned
    // early above if there isn't one, so this is belt-and-braces
    // rather than a real branch.
    climberCount: stats.set?.climberCount ?? 0,
  };
}
