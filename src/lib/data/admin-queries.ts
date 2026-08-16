/**
 * Admin-surface queries. Parallel to the climber-facing
 * `*-queries.ts` modules — kept separate so the admin code path can
 * be audited and upgraded without touching climber-facing reads.
 *
 * Every function takes `supabase` as the first argument so the caller
 * controls auth context (RLS applies to the authed client; the service
 * client is only used by the mutation layer for cross-user operations).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { one, readMany, readSingle } from "./read";
type Supabase = SupabaseClient<Database>;

export interface AdminGymSummary {
  id: string;
  name: string;
  slug: string;
  plan_tier: string;
  role: "admin" | "owner";
}

/**
 * Quick gate: is the caller an admin (or owner) of this specific gym?
 * Reads gym_admins (the authoritative source per `is_gym_admin()` RLS),
 * NOT gym_memberships.role — that column is cosmetic.
 */
export async function isGymAdminOf(
  supabase: Supabase,
  userId: string,
  gymId: string,
): Promise<boolean> {
  const row = await readSingle<{ user_id: string }>(
    supabase
      .from("gym_admins")
      .select("user_id")
      .eq("user_id", userId)
      .eq("gym_id", gymId)
      .maybeSingle(),
    "isgymadminof_failed",
  );
  return row !== null;
}

/**
 * Every gym the caller is an admin or owner of. Returned sorted by the
 * time they joined the admin team — stable ordering for the gym
 * picker in the admin shell.
 */
export async function getAdminGymsForUser(
  supabase: Supabase,
  userId: string
): Promise<AdminGymSummary[]> {
  const { data, error } = await supabase
    .from("gym_admins")
    .select("role, created_at, gyms:gym_id (id, name, slug, plan_tier)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.warn("getadmingymsforuser_failed", { err: formatErrorForLog(error) });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const gym = one(row.gyms);
    if (!gym) return [];
    return [{
      id: gym.id,
      name: gym.name,
      slug: gym.slug,
      plan_tier: gym.plan_tier,
      role: row.role as "admin" | "owner",
    }];
  });
}

export interface AdminSetSummary {
  id: string;
  name: string | null;
  status: "draft" | "live" | "archived";
  starts_at: string;
  ends_at: string;
  grading_scale: "v" | "font" | "points";
  max_grade: number;
  closing_event: boolean;
}

/** The one live set at this gym, if any. Null when no live set exists. */
export interface GymTeamMember {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: "admin" | "owner";
  since: string;
}

export interface GymPendingInvite {
  id: string;
  email: string;
  role: "admin" | "owner";
  invited_at: string;
  expires_at: string;
  /** Already past `expires_at`. Still listed — an admin needs to see
   *  why nothing happened, and re-inviting the same email refreshes
   *  the window rather than erroring. */
  expired: boolean;
}

/**
 * Who runs this gym, and who has been asked to.
 *
 * `gym_admins` is the authoritative source — NOT `gym_memberships.role`,
 * which is cosmetic (CLAUDE.md "Admin vs climber vs organiser").
 */
export async function getGymTeam(
  supabase: Supabase,
  gymId: string,
): Promise<GymTeamMember[]> {
  const { data, error } = await supabase
    .from("gym_admins")
    .select("user_id, role, created_at, profiles:user_id (username, name, avatar_url)")
    .eq("gym_id", gymId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.warn("getgymteam_failed", { err: formatErrorForLog(error) });
    return [];
  }

  return (data ?? []).map((row) => {
    const profile = one(row.profiles);
    return {
      user_id: row.user_id,
      username: profile?.username ?? null,
      display_name: profile?.name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role: row.role as "admin" | "owner",
      since: row.created_at,
    };
  });
}

/**
 * Invites that haven't been accepted yet, expired ones included.
 *
 * Hiding the expired ones would answer "why has nothing happened?"
 * with an empty list, which is the least useful possible answer.
 */
export async function getPendingInvites(
  supabase: Supabase,
  gymId: string,
): Promise<GymPendingInvite[]> {
  const { data, error } = await supabase
    .from("gym_invites")
    .select("id, email, role, invited_at, expires_at")
    .eq("gym_id", gymId)
    .is("accepted_at", null)
    .order("invited_at", { ascending: false });

  if (error) {
    logger.warn("getpendinginvites_failed", { err: formatErrorForLog(error) });
    return [];
  }

  const now = Date.now();
  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as "admin" | "owner",
    invited_at: row.invited_at,
    expires_at: row.expires_at,
    expired: new Date(row.expires_at).getTime() < now,
  }));
}

export async function getActiveSetForAdminGym(
  supabase: Supabase,
  gymId: string
): Promise<AdminSetSummary | null> {
  return readSingle<AdminSetSummary>(
    supabase
      .from("sets")
      .select("id, name, status, starts_at, ends_at, grading_scale, max_grade, closing_event")
      .eq("gym_id", gymId)
      .eq("status", "live")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "getactivesetforadmingym_failed",
  );
}

/** All sets (any status) for the gym, newest first. Used by the sets list. */
export async function getAllSetsForAdminGym(
  supabase: Supabase,
  gymId: string
): Promise<AdminSetSummary[]> {
  return readMany<AdminSetSummary>(
    supabase
      .from("sets")
      .select("id, name, status, starts_at, ends_at, grading_scale, max_grade, closing_event")
      .eq("gym_id", gymId)
      .order("starts_at", { ascending: false })
      // Ceiling-guard. Long-running gyms (weekly resets for 4+ years)
      // would otherwise pull hundreds of archived sets on every admin
      // dashboard render. 200 covers >99% of real gyms; older history
      // needs explicit pagination.
      .limit(200),
    "getallsetsforadmingym_failed",
  );
}

/**
 * One set by id, for the admin edit + routes pages.
 *
 * Those pages used to list every set at the admin's gym (200-row
 * ceiling) and `.find()` the one they wanted, using the list as both
 * the data source AND the authorisation check. That coupling is what
 * made a second gym's sets unreachable: the list is scoped to
 * whichever gym `requireGymAdmin()` resolved, so an admin of two gyms
 * got `notFound()` on every set belonging to the other one.
 *
 * Authorisation now comes from `requireAdminOfSet(setId)`, which
 * resolves the set's OWN gym and checks admin rights against that.
 * This is just the read.
 */
export async function getSetForAdmin(
  supabase: Supabase,
  setId: string,
): Promise<AdminSetSummary | null> {
  return readSingle<AdminSetSummary>(
    supabase
      .from("sets")
      .select("id, name, status, starts_at, ends_at, grading_scale, max_grade, closing_event")
      .eq("id", setId)
      .maybeSingle(),
    "getsetforadmin_failed",
  );
}

export interface RouteTagRow {
  id: string;
  slug: string;
  name: string;
}

/** Full catalogue of route tags (static — seeded via migration). */
export async function getRouteTags(supabase: Supabase): Promise<RouteTagRow[]> {
  return readMany<RouteTagRow>(
    supabase.from("route_tags").select("id, slug, name").order("name"),
    "getroutetags_failed",
  );
}

export interface AdminRouteRow {
  id: string;
  number: number;
  has_zone: boolean;
  setter_name: string | null;
  tag_ids: string[];
}

/**
 * All routes in a set with their tags pre-joined. One round-trip for
 * the admin routes page — avoids N+1 fetches when the admin scans
 * down a 20-route list.
 */
export async function getAdminRoutesForSet(
  supabase: Supabase,
  setId: string
): Promise<AdminRouteRow[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("id, number, has_zone, setter_name, route_tags_map (tag_id)")
    .eq("set_id", setId)
    .order("number");

  if (error) {
    logger.warn("getadminroutesforset_failed", { err: formatErrorForLog(error) });
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    has_zone: r.has_zone,
    setter_name: r.setter_name,
    tag_ids: (r.route_tags_map ?? []).map((m) => m.tag_id),
  }));
}
