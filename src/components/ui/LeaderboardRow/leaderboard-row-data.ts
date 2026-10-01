/**
 * The row primitive's data shape and the gym-board adapter to it.
 *
 * Kept out of `LeaderboardRow.tsx` because that module is "use client",
 * and on the server every export of a client module is a client
 * reference — a component renders, but a function is a stub that
 * throws when called. `FriendsBoard` and `CompetitionLeaderboard` are
 * server components and map their rows through this on the server;
 * living beside the component, it took /friends down (bdb60d4).
 * `src/test/client-boundary.test.ts` holds the line.
 */

/**
 * Minimal shape a leaderboard row needs to render. Deliberately
 * decoupled from `LeaderboardEntry` (gym leaderboard) and
 * `MatchLeaderboardRow` (match leaderboard) so both surfaces can use
 * the same visual primitive via a tiny adapter at the call site.
 *
 * `rank = null` renders as "—" (the unranked-user fallback).
 */
export interface LeaderboardRowData {
  userId: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  rank: number | null;
  /**
   * Pre-formatted by the caller. A gym board passes a whole number; a
   * handicapped Match passes something like "4.7", since scoring
   * relative to a ceiling stops totals being integers.
   */
  points: number | string;
  flashes: number;
}

/**
 * A gym-side ranked row (`LeaderboardEntry` and everything that extends
 * or mirrors it: the Chorkboard, a competition's board, the friends
 * board) as the primitive's data. The three boards each spelled this
 * mapping out. A game's board doesn't come through here: its rows are
 * seats, keyed and named differently, and its points are formatted.
 */
export function toLeaderboardRowData(row: {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  rank: number | null;
  points: number;
  flashes: number;
}): LeaderboardRowData {
  return {
    userId: row.user_id,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
    rank: row.rank,
    points: row.points,
    flashes: row.flashes,
  };
}
