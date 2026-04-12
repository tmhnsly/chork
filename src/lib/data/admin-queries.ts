/**
 * Admin-surface queries. Parallel to `src/lib/data/queries.ts` — kept
 * separate so the admin code path can be audited and upgraded without
 * touching climber-facing reads.
 *
 * Every function takes `supabase` as the first argument so the caller
 * controls auth context (RLS applies to the authed client; the service
 * client is only used by the mutation layer for cross-user operations).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;

export interface AdminGymSummary {
  id: string;
  name: string;
  slug: string;
  plan_tier: string;
  role: "admin" | "owner";
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
    console.warn("[chork] getAdminGymsForUser failed:", error);
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const gym = Array.isArray(row.gyms) ? row.gyms[0] : row.gyms;
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
export async function getActiveSetForAdminGym(
  supabase: Supabase,
  gymId: string
): Promise<AdminSetSummary | null> {
  const { data, error } = await supabase
    .from("sets")
    .select("id, name, status, starts_at, ends_at, grading_scale, max_grade, closing_event")
    .eq("gym_id", gymId)
    .eq("status", "live")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[chork] getActiveSetForAdminGym failed:", error);
    return null;
  }
  return (data as AdminSetSummary | null) ?? null;
}

/** All sets (any status) for the gym, newest first. Used by the sets list. */
export async function getAllSetsForAdminGym(
  supabase: Supabase,
  gymId: string
): Promise<AdminSetSummary[]> {
  const { data, error } = await supabase
    .from("sets")
    .select("id, name, status, starts_at, ends_at, grading_scale, max_grade, closing_event")
    .eq("gym_id", gymId)
    .order("starts_at", { ascending: false });

  if (error) {
    console.warn("[chork] getAllSetsForAdminGym failed:", error);
    return [];
  }
  return (data ?? []) as AdminSetSummary[];
}

export interface RouteTagRow {
  id: string;
  slug: string;
  name: string;
}

/** Full catalogue of route tags (static — seeded via migration). */
export async function getRouteTags(supabase: Supabase): Promise<RouteTagRow[]> {
  const { data, error } = await supabase
    .from("route_tags")
    .select("id, slug, name")
    .order("name");

  if (error) {
    console.warn("[chork] getRouteTags failed:", error);
    return [];
  }
  return data ?? [];
}
