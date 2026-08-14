import type { MatchHistoryRow } from "./match-types";

/**
 * Lifetime aggregate across every match a climber has played. Computed
 * client-side from `getUserMatches` rows — the existing RPC already
 * returns per-match aggregates, so summing across them is a one-pass
 * loop with no extra round-trip.
 *
 * Aggregating client-side rather than via a new RPC is cheap for the
 * realistic case (single-digit to low-double-digit matches per climber).
 * If a power user accumulates hundreds of matches, the caller can pass a
 * higher `limit` to `getUserMatches` and re-aggregate, or we add a
 * dedicated `get_match_lifetime_stats` RPC. Both are extensions.
 *
 * Domain rule: match stats are SEPARATE from gym stats. This helper
 * computes only match totals — it never combines with wall stats. The
 * profile renders them as a sibling card to the gym "All Time" card.
 */
export interface MatchLifetimeStats {
  matchesPlayed: number;
  matchesWon: number;
  /** Lowest rank achieved across all matches (1 = best). null when no matches. */
  bestFinish: number | null;
  totalSends: number;
  totalFlashes: number;
  totalPoints: number;
  /** Flashes / sends as a fraction. null when sends === 0. */
  flashRate: number | null;
  /** Average points per match (1dp). null when no matches. */
  pointsPerMatch: number | null;
}

export function computeMatchLifetimeStats(
  matches: MatchHistoryRow[],
): MatchLifetimeStats {
  if (matches.length === 0) {
    return {
      matchesPlayed: 0,
      matchesWon: 0,
      bestFinish: null,
      totalSends: 0,
      totalFlashes: 0,
      totalPoints: 0,
      flashRate: null,
      pointsPerMatch: null,
    };
  }

  let totalSends = 0;
  let totalFlashes = 0;
  let totalPoints = 0;
  let matchesWon = 0;
  // Valid ranks start at 1 (dense_rank in the RPC). 0 / null means
  // unranked — typically a player who joined and never logged a
  // send. Skip those rows when picking bestFinish so the lifetime
  // best isn't dragged down to 0 (which would then beat every real
  // rank under `<` comparison and silently overwrite a legit 1st
  // place finish).
  let bestFinish: number | null = null;

  for (const match of matches) {
    totalSends += match.user_sends;
    totalFlashes += match.user_flashes;
    totalPoints += match.user_points;
    if (match.user_is_winner) matchesWon += 1;
    if (match.user_rank > 0) {
      if (bestFinish === null || match.user_rank < bestFinish) {
        bestFinish = match.user_rank;
      }
    }
  }

  return {
    matchesPlayed: matches.length,
    matchesWon,
    bestFinish,
    totalSends,
    totalFlashes,
    totalPoints,
    flashRate: totalSends > 0 ? totalFlashes / totalSends : null,
    pointsPerMatch: Math.round((totalPoints / matches.length) * 10) / 10,
  };
}
