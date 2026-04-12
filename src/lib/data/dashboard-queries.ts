/**
 * Admin-dashboard queries — thin wrappers around migration-018 RPCs.
 * Every aggregate happens in Postgres (per the hardening audit); these
 * functions only shape the rows for TS consumers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;

// ── A. Active set overview ────────────────────────
export interface SetOverview {
  total_routes: number;
  total_sends: number;
  max_possible_sends: number;
  send_completion_pct: number;
  days_remaining: number | null;
  active_climber_count: number;
}

export async function getSetOverview(
  supabase: Supabase,
  setId: string
): Promise<SetOverview | null> {
  const { data, error } = await supabase.rpc("get_set_overview", { p_set_id: setId });
  if (error) {
    console.warn("[chork] getSetOverview failed:", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  return row as SetOverview | null;
}

// ── B. Top routes ─────────────────────────────────
export interface TopRouteRow {
  route_id: string;
  number: number;
  has_zone: boolean;
  send_count: number;
  attempt_count: number;
  flash_count: number;
  flash_rate: number | null; // 0..100 with 1dp, null when send_count = 0
}

export async function getTopRoutes(
  supabase: Supabase,
  setId: string,
  limit = 10
): Promise<TopRouteRow[]> {
  const { data, error } = await supabase.rpc("get_top_routes", {
    p_set_id: setId,
    p_limit: limit,
  });
  if (error) {
    console.warn("[chork] getTopRoutes failed:", error);
    return [];
  }
  return (data ?? []) as TopRouteRow[];
}

// ── C + D. Active climbers + engagement trend ─────
export async function getActiveClimberCount(
  supabase: Supabase,
  setId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("get_active_climber_count", { p_set_id: setId });
  if (error) {
    console.warn("[chork] getActiveClimberCount failed:", error);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export interface EngagementPoint {
  set_id: string;
  name: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "draft" | "live" | "archived";
  active_climber_count: number;
}

export async function getEngagementTrend(
  supabase: Supabase,
  gymId: string,
  limit = 12
): Promise<EngagementPoint[]> {
  const { data, error } = await supabase.rpc("get_engagement_trend", {
    p_gym_id: gymId,
    p_limit: limit,
  });
  if (error) {
    console.warn("[chork] getEngagementTrend failed:", error);
    return [];
  }
  return (data ?? []) as EngagementPoint[];
}

// ── E. Flash leaderboard ──────────────────────────
export interface FlashLeader {
  user_id: string;
  username: string;
  avatar_url: string;
  flash_count: number;
}

export async function getFlashLeaderboardSet(
  supabase: Supabase,
  setId: string,
  limit = 5
): Promise<FlashLeader[]> {
  const { data, error } = await supabase.rpc("get_flash_leaderboard_set", {
    p_set_id: setId,
    p_limit: limit,
  });
  if (error) {
    console.warn("[chork] getFlashLeaderboardSet failed:", error);
    return [];
  }
  return (data ?? []) as FlashLeader[];
}

// ── F. Zone vs send ratio ─────────────────────────
export interface ZoneSendRow {
  route_id: string;
  number: number;
  has_zone: boolean;
  send_count: number;
  zone_only: number;
}

export async function getZoneSendRatio(
  supabase: Supabase,
  setId: string
): Promise<ZoneSendRow[]> {
  const { data, error } = await supabase.rpc("get_zone_send_ratio", { p_set_id: setId });
  if (error) {
    console.warn("[chork] getZoneSendRatio failed:", error);
    return [];
  }
  return (data ?? []) as ZoneSendRow[];
}

// ── G. Community grade distribution ───────────────
export interface GradeDistributionRow {
  route_id: string;
  number: number;
  grade: number;
  vote_count: number;
}

export async function getCommunityGradeDistribution(
  supabase: Supabase,
  setId: string
): Promise<GradeDistributionRow[]> {
  const { data, error } = await supabase.rpc("get_community_grade_distribution", { p_set_id: setId });
  if (error) {
    console.warn("[chork] getCommunityGradeDistribution failed:", error);
    return [];
  }
  return (data ?? []) as GradeDistributionRow[];
}

// ── H. Setter breakdown ───────────────────────────
export interface SetterBreakdownRow {
  setter_name: string;
  route_count: number;
  total_sends: number;
  total_attempts: number;
  flash_rate: number | null;
}

export async function getSetterBreakdown(
  supabase: Supabase,
  setId: string
): Promise<SetterBreakdownRow[]> {
  const { data, error } = await supabase.rpc("get_setter_breakdown", { p_set_id: setId });
  if (error) {
    console.warn("[chork] getSetterBreakdown failed:", error);
    return [];
  }
  return (data ?? []) as SetterBreakdownRow[];
}

// ── I. All-time overview ──────────────────────────
export interface AllTimeOverview {
  unique_climbers: number;
  total_sends: number;
  set_count: number;
  top_route_id: string | null;
  top_route_number: number | null;
  top_route_set_id: string | null;
  top_route_send_count: number | null;
}

export async function getAllTimeOverview(
  supabase: Supabase,
  gymId: string
): Promise<AllTimeOverview | null> {
  const { data, error } = await supabase.rpc("get_all_time_overview", { p_gym_id: gymId });
  if (error) {
    console.warn("[chork] getAllTimeOverview failed:", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  return row as AllTimeOverview | null;
}
