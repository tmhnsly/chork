import type { LeaderboardEntry } from "./types";

// `LeaderboardEntry` (types.ts) is the one ranked-row shape for every
// board — gym Chorkboard, crew, competition. A field-for-field twin
// (`RankedRow`) used to live here and each surface picked one
// arbitrarily; domain types extend `LeaderboardEntry` with
// passthrough fields (e.g. `category_id`) rather than redeclaring the
// nine columns.

/**
 * Wire shape of a ranked row as PostgREST delivers it: `rank` is a
 * Postgres bigint, which arrives as a JSON string (or a number on
 * some paths) and must be `Number()`-coerced; null stays null.
 */
export type RawRankedRow = Omit<LeaderboardEntry, "rank"> & {
  rank: number | string | null;
};

/**
 * Normalise ranked RPC rows — owns the bigint-rank coercion invariant
 * described on `RawRankedRow`. Extra fields beyond the base shape
 * (e.g. `category_id`) pass through untouched.
 */
export function normaliseRankedRows<Extra extends object = Record<never, never>>(
  rows: Array<RawRankedRow & Extra>,
): Array<LeaderboardEntry & Extra> {
  return rows.map((r) => ({
    ...r,
    rank: r.rank === null ? null : Number(r.rank),
  }));
}

