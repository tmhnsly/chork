import type { LeaderboardEntry } from "./types";

/**
 * Base shape shared by every ranked-leaderboard RPC (gym leaderboard,
 * competition leaderboard, crew leaderboard). Domain types extend it
 * with passthrough fields (e.g. `category_id`) rather than redeclaring
 * the nine columns.
 */
export interface RankedRow {
  user_id: string;
  username: string;
  name: string;
  avatar_url: string;
  /** null = unranked (no qualifying logs). */
  rank: number | null;
  sends: number;
  flashes: number;
  zones: number;
  points: number;
}

/**
 * Wire shape of a ranked row as PostgREST delivers it: `rank` is a
 * Postgres bigint, which arrives as a JSON string (or a number on
 * some paths) and must be `Number()`-coerced; null stays null.
 */
export type RawRankedRow = Omit<RankedRow, "rank"> & {
  rank: number | string | null;
};

/**
 * Normalise ranked RPC rows — owns the bigint-rank coercion invariant
 * described on `RawRankedRow`. Extra fields beyond the base shape
 * (e.g. `category_id`) pass through untouched.
 */
export function normaliseRankedRows<Extra extends object = Record<never, never>>(
  rows: Array<RawRankedRow & Extra>,
): Array<RankedRow & Extra> {
  return rows.map((r) => ({
    ...r,
    rank: r.rank === null ? null : Number(r.rank),
  }));
}

/**
 * Adapter: LeaderboardEntry → UserAvatar's expected shape.
 * UserAvatar expects `id` but leaderboard rows carry `user_id`.
 *
 * Lives in lib/data so cross-feature surfaces (Leaderboard,
 * Competitions, future jam/crew leaderboards) can render avatars from
 * leaderboard rows without reaching into another feature's folder.
 */
export function toAvatarUser(entry: LeaderboardEntry) {
  return {
    id: entry.user_id,
    username: entry.username,
    name: entry.name,
    avatar_url: entry.avatar_url,
  };
}
