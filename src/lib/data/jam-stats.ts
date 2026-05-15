import type { JamHistoryRow } from "./jam-types";

/**
 * Lifetime aggregate across every jam a climber has played. Computed
 * client-side from `getUserJams` rows — the existing RPC already
 * returns per-jam aggregates, so summing across them is a one-pass
 * loop with no extra round-trip.
 *
 * Aggregating client-side rather than via a new RPC is cheap for the
 * realistic case (single-digit to low-double-digit jams per climber).
 * If a power user accumulates hundreds of jams, the caller can pass a
 * higher `limit` to `getUserJams` and re-aggregate, or we add a
 * dedicated `get_jam_lifetime_stats` RPC. Both are extensions.
 *
 * Domain rule: jam stats are SEPARATE from gym stats. This helper
 * computes only jam totals — it never combines with wall stats. The
 * profile renders them as a sibling card to the gym "All Time" card.
 */
export interface JamLifetimeStats {
  jamsPlayed: number;
  jamsWon: number;
  /** Lowest rank achieved across all jams (1 = best). null when no jams. */
  bestFinish: number | null;
  totalSends: number;
  totalFlashes: number;
  totalPoints: number;
  /** Flashes / sends as a fraction. null when sends === 0. */
  flashRate: number | null;
  /** Average points per jam (1dp). null when no jams. */
  pointsPerJam: number | null;
}

export function computeJamLifetimeStats(
  jams: JamHistoryRow[],
): JamLifetimeStats {
  if (jams.length === 0) {
    return {
      jamsPlayed: 0,
      jamsWon: 0,
      bestFinish: null,
      totalSends: 0,
      totalFlashes: 0,
      totalPoints: 0,
      flashRate: null,
      pointsPerJam: null,
    };
  }

  let totalSends = 0;
  let totalFlashes = 0;
  let totalPoints = 0;
  let jamsWon = 0;
  let bestFinish = jams[0].user_rank;

  for (const jam of jams) {
    totalSends += jam.user_sends;
    totalFlashes += jam.user_flashes;
    totalPoints += jam.user_points;
    if (jam.user_is_winner) jamsWon += 1;
    if (jam.user_rank < bestFinish) bestFinish = jam.user_rank;
  }

  return {
    jamsPlayed: jams.length,
    jamsWon,
    bestFinish,
    totalSends,
    totalFlashes,
    totalPoints,
    flashRate: totalSends > 0 ? totalFlashes / totalSends : null,
    pointsPerJam: Math.round((totalPoints / jams.length) * 10) / 10,
  };
}
