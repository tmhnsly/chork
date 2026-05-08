import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import type { LeaderboardEntry } from "./types";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { tags } from "@/lib/cache/tags";

/**
 * Leaderboard + gym-stats queries.
 *
 * Sibling to crew-queries / admin-queries / competition-queries /
 * dashboard-queries / jam-queries — the per-domain `*-queries.ts`
 * pattern means each surface (Leaderboard, ClimberSheet, GymStatsStrip)
 * imports from one place. Error contract matches the rest: swallow
 * Postgres errors, log, return a neutral fallback.
 *
 * Cached variants (`*Cached`) wrap the service-role-granted RPCs from
 * migration 039 — see queries.ts for the broader page-level-gate +
 * service-role-cached-RPC pattern doc.
 */

type Supabase = SupabaseClient<Database>;

// ── Stats shape ───────────────────────────────────

export interface GymStats {
  climberCount: number;
  totalSends: number;
  totalFlashes: number;
  totalRoutes: number;
}

export interface GymStatsBuckets {
  all_time: GymStats;
  set: GymStats | null;
}

// ── Per-request reads ─────────────────────────────

/** Fetch 5 rows centred on the user's rank. Empty array if user has no climbs. */
export async function getLeaderboardNeighbourhood(
  supabase: Supabase,
  gymId: string,
  userId: string,
  setId: string | null,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_leaderboard_neighbourhood", {
    p_gym_id: gymId,
    p_user_id: userId,
    p_set_id: setId ?? undefined,
  });
  if (error) {
    logger.warn("getleaderboardneighbourhood_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return normaliseLeaderboardRows(data ?? []);
}

/** Fetch the user's own row. Returns null if unranked. */
export async function getLeaderboardUserRow(
  supabase: Supabase,
  gymId: string,
  userId: string,
  setId: string | null,
): Promise<LeaderboardEntry | null> {
  const { data, error } = await supabase.rpc("get_leaderboard_user_row", {
    p_gym_id: gymId,
    p_user_id: userId,
    p_set_id: setId ?? undefined,
  });
  if (error) {
    logger.warn("getleaderboarduserrow_failed", { err: formatErrorForLog(error) });
    return null;
  }
  const rows = normaliseLeaderboardRows(data ?? []);
  return rows[0] ?? null;
}

// ── Server-cached variants (migration 039) ─────────
//
// Cache entries are shared across every viewer of the same gym/set —
// N concurrent viewers cost 1 DB compute per mutation instead of N
// per refresh.
//
// Security: the underlying RPCs (get_leaderboard_*_cached,
// get_gym_stats_v2_cached) drop the is_gym_member gate that blocked
// service-role callers. They're granted ONLY to service_role; PostgREST
// won't expose them to the browser. Callers MUST verify gym membership
// at the page level before invoking — typically by going through
// requireAuth() which already enforces gymId === profile.active_gym_id.

export function getLeaderboardCached(
  gymId: string,
  setId: string | null,
  limit: number = 10,
  offset: number = 0,
): Promise<LeaderboardEntry[]> {
  const fn = cachedQuery(
    ["leaderboard", gymId, setId ?? "all", String(limit), String(offset)],
    async (): Promise<LeaderboardEntry[]> => {
      const supabase = createCachedContextClient();
      const { data, error } = setId
        ? await supabase.rpc("get_leaderboard_set_cached", {
            p_gym_id: gymId,
            p_set_id: setId,
            p_limit: limit,
            p_offset: offset,
          })
        : await supabase.rpc("get_leaderboard_all_time_cached", {
            p_gym_id: gymId,
            p_limit: limit,
            p_offset: offset,
          });
      if (error) {
        logger.warn("getleaderboardcached_failed", { err: formatErrorForLog(error) });
        return [];
      }
      return normaliseLeaderboardRows(data ?? []);
    },
    {
      tags: setId
        ? [tags.setLeaderboard(setId), tags.gym(gymId)]
        : [tags.gym(gymId)],
      // 60s — short enough that climbers see new sends within a minute
      // even without a precise tag bust hitting their cache; long enough
      // that 100 simultaneous viewers cost 1 RPC, not 100.
      revalidate: 60,
    },
  );
  return fn();
}

export function getGymStatsV2Cached(
  gymId: string,
  setId: string | null = null,
): Promise<GymStatsBuckets> {
  const fn = cachedQuery(
    ["gym-stats-v2", gymId, setId ?? "all"],
    async (): Promise<GymStatsBuckets> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase.rpc("get_gym_stats_v2_cached", {
        p_gym_id: gymId,
        p_set_id: setId ?? undefined,
      });
      if (error) {
        logger.warn("getgymstatsv2cached_failed", { err: formatErrorForLog(error) });
        return {
          all_time: { climberCount: 0, totalSends: 0, totalFlashes: 0, totalRoutes: 0 },
          set: null,
        };
      }
      type Raw = { climbers: number; sends: number; flashes: number; routes: number };
      const raw = data as { all_time: Raw; set: Raw | null } | null;
      const toStats = (r: Raw): GymStats => ({
        climberCount: r.climbers,
        totalSends: r.sends,
        totalFlashes: r.flashes,
        totalRoutes: r.routes,
      });
      return {
        all_time: raw ? toStats(raw.all_time) : {
          climberCount: 0, totalSends: 0, totalFlashes: 0, totalRoutes: 0,
        },
        set: raw?.set ? toStats(raw.set) : null,
      };
    },
    {
      tags: setId
        ? [tags.setLeaderboard(setId), tags.gym(gymId)]
        : [tags.gym(gymId)],
      revalidate: 60,
    },
  );
  return fn();
}

// ── Helpers ──────────────────────────────────────

/** Normalise RPC rows — rank comes back as bigint (string in JSON). */
function normaliseLeaderboardRows(
  rows: Array<{
    user_id: string;
    username: string;
    name: string;
    avatar_url: string;
    rank: number | string | null;
    sends: number;
    flashes: number;
    zones: number;
    points: number;
  }>,
): LeaderboardEntry[] {
  return rows.map((r) => ({
    ...r,
    rank: r.rank === null ? null : Number(r.rank),
  }));
}
