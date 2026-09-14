"use server";

import { requireAuth } from "@/lib/auth";
import { getCurrentSet } from "@/lib/data/set-queries";
import {
  getLeaderboardUserRow,
  getLeaderboardNeighbourhood,
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
  flashes: number;
  /** Everyone with at least one send on this Set — the "of 51". */
  climberCount: number;
  /**
   * The place directly above and what it takes to PASS them: their
   * points minus yours, plus one — the strip's "3 pts to pass #12".
   * Plus one because rank is points-first, so matching them only
   * ties (they win on flashes). Null at the top, when unranked, or
   * when the neighbourhood holds nobody above (a board of one).
   */
  toNext: { rank: number; points: number } | null;
}

export async function fetchMyRank(): Promise<MyRank | null> {
  const auth = await requireAuth();
  if ("error" in auth) return null;

  const { supabase, userId, gymId } = auth;
  const set = await getCurrentSet(gymId);
  if (!set) return null;

  const [row, around, stats] = await Promise.all([
    getLeaderboardUserRow(supabase, gymId, userId, set.id),
    getLeaderboardNeighbourhood(supabase, gymId, userId, set.id),
    getGymStatsV2Cached(gymId, set.id),
  ]);

  // The nearest rank above yours. Someone sharing your rank is not
  // above you; someone on your points but a rank up (more flashes) is.
  const above =
    row?.rank != null
      ? around
          .filter((e) => e.rank != null && e.rank < row.rank!)
          .sort((a, b) => b.rank! - a.rank!)[0] ?? null
      : null;

  return {
    rank: row?.rank ?? null,
    points: row?.points ?? 0,
    flashes: row?.flashes ?? 0,
    // `set` is null when the gym has no live Set — but we returned
    // early above if there isn't one, so this is belt-and-braces
    // rather than a real branch.
    climberCount: stats.set?.climberCount ?? 0,
    toNext:
      above && above.rank != null && row
        ? { rank: above.rank, points: above.points - row.points + 1 }
        : null,
  };
}
