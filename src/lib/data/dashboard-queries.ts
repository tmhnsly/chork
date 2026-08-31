/**
 * Admin-dashboard reads — the wire shapes of the migration-018 RPCs,
 * and ONE deep read that fetches the whole dashboard.
 *
 * This module used to export eight one-line wrappers with eight
 * single callers, all the same caller — the read-side twin of the
 * pass-through mutation layer that was inlined in 2026-08 (each
 * wrapper's interface as large as its body). Inlining the RPC calls
 * into the page would break the all-reads-through-lib/data rule, so
 * the deepening goes the other way: the page's eight-way fan-out
 * moves HERE, behind one function whose interface is "give me the
 * dashboard". Every aggregate still happens in Postgres.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { readSingle, readMany } from "./read";
type Supabase = SupabaseClient<Database>;

// ── Wire shapes (widgets import these; single home) ──

export interface SetOverview {
  total_routes: number;
  total_sends: number;
  max_possible_sends: number;
  send_completion_pct: number;
  days_remaining: number | null;
  /**
   * How far through the set's lifespan we are, 0..100, or null when
   * the set has no dates. Computed from Postgres `now()` (migration
   * 075) rather than in React — see `SetPaceWidget`.
   */
  time_elapsed_pct: number | null;
  active_climber_count: number;
}

export interface TopRouteRow {
  route_id: string;
  number: number;
  has_zone: boolean;
  send_count: number;
  attempt_count: number;
  flash_count: number;
  flash_rate: number | null; // 0..100 with 1dp, null when send_count = 0
}

export interface EngagementPoint {
  set_id: string;
  name: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "draft" | "live" | "archived";
  active_climber_count: number;
}

export interface FlashLeader {
  user_id: string;
  username: string;
  avatar_url: string;
  flash_count: number;
}

export interface ZoneSendRow {
  route_id: string;
  number: number;
  has_zone: boolean;
  send_count: number;
  zone_only: number;
}

export interface SetterBreakdownRow {
  setter_name: string;
  route_count: number;
  total_sends: number;
  total_attempts: number;
  flash_rate: number | null;
}

export interface AllTimeOverview {
  unique_climbers: number;
  total_sends: number;
  set_count: number;
  top_route_id: string | null;
  top_route_number: number | null;
  top_route_set_id: string | null;
  top_route_send_count: number | null;
}

/** Everything the admin dashboard renders, keyed the way the page
 *  destructures it. */
export interface AdminDashboardData {
  overview: SetOverview | null;
  topRoutes: TopRouteRow[];
  engagement: EngagementPoint[];
  activeCount: number;
  flashes: FlashLeader[];
  zoneRows: ZoneSendRow[];
  allTime: AllTimeOverview | null;
  setterRows: SetterBreakdownRow[];
}

/**
 * The whole dashboard in one call — eight RPCs fanned out in
 * parallel, each swallowing to its neutral value per the read
 * contract, so one failed widget degrades to its empty state instead
 * of taking the page.
 */
export async function getAdminDashboard(
  supabase: Supabase,
  opts: {
    gymId: string;
    setId: string;
    topRoutesLimit?: number;
    engagementLimit?: number;
    flashLimit?: number;
  },
): Promise<AdminDashboardData> {
  const {
    gymId,
    setId,
    topRoutesLimit = 15,
    engagementLimit = 12,
    flashLimit = 5,
  } = opts;

  const [
    overview,
    topRoutes,
    engagement,
    activeCount,
    flashes,
    zoneRows,
    allTime,
    setterRows,
  ] = await Promise.all([
    readSingle<SetOverview>(
      supabase.rpc("get_set_overview", { p_set_id: setId }),
      "getsetoverview_failed",
    ),
    readMany<TopRouteRow>(
      supabase.rpc("get_top_routes", { p_set_id: setId, p_limit: topRoutesLimit }),
      "gettoproutes_failed",
    ),
    readMany<EngagementPoint>(
      supabase.rpc("get_engagement_trend", { p_gym_id: gymId, p_limit: engagementLimit }),
      "getengagementtrend_failed",
    ),
    // Scalar-returning RPC — readSingle expects a row, so this one
    // keeps its bespoke swallow-to-zero.
    supabase
      .rpc("get_active_climber_count", { p_set_id: setId })
      .then(({ data, error }) => {
        if (error) {
          logger.warn("getactiveclimbercount_failed", {
            err: formatErrorForLog(error),
          });
          return 0;
        }
        return typeof data === "number" ? data : 0;
      }),
    readMany<FlashLeader>(
      supabase.rpc("get_flash_leaderboard_set", { p_set_id: setId, p_limit: flashLimit }),
      "getflashleaderboardset_failed",
    ),
    readMany<ZoneSendRow>(
      supabase.rpc("get_zone_send_ratio", { p_set_id: setId }),
      "getzonesendratio_failed",
    ),
    readSingle<AllTimeOverview>(
      supabase.rpc("get_all_time_overview", { p_gym_id: gymId }),
      "getalltimeoverview_failed",
    ),
    readMany<SetterBreakdownRow>(
      supabase.rpc("get_setter_breakdown", { p_set_id: setId }),
      "getsetterbreakdown_failed",
    ),
  ]);

  return {
    overview,
    topRoutes,
    engagement,
    activeCount,
    flashes,
    zoneRows,
    allTime,
    setterRows,
  };
}
