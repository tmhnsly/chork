import "server-only";
import {
  createServerSupabase,
  createServiceClient,
  getServerUser,
  getServerProfile,
} from "./supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { AUTH_REQUIRED_ERROR } from "./auth-errors";
import { UUID_RE } from "./validation";
import { enforce as enforceRateLimit } from "./rate-limit";

type AuthSuccess = {
  supabase: SupabaseClient<Database>;
  userId: string;
  gymId: string;
};
type AuthFailure = { error: string };

/**
 * Auth check that only requires sign-in, no gym.
 * Use for onboarding and account setup.
 *
 * Reads through the React-cache-wrapped `getServerUser` so multiple
 * auth helpers invoked during the same request share a single auth
 * round-trip.
 */
export async function requireSignedIn(): Promise<
  { supabase: SupabaseClient<Database>; userId: string } | AuthFailure
> {
  const [supabase, user] = await Promise.all([
    createServerSupabase(),
    getServerUser(),
  ]);
  if (!user) return { error: AUTH_REQUIRED_ERROR };
  return { supabase, userId: user.id };
}

export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const [supabase, profile] = await Promise.all([
    createServerSupabase(),
    getServerProfile(),
  ]);

  if (!profile) {
    return { error: AUTH_REQUIRED_ERROR };
  }

  if (!profile.active_gym_id) {
    return { error: "No gym selected" };
  }

  return { supabase, userId: profile.id, gymId: profile.active_gym_id };
}

type AdminAuthSuccess = {
  supabase: SupabaseClient<Database>;
  userId: string;
  /**
   * The gym the admin is currently operating on. Derived from an
   * explicit caller-supplied gym (after verifying admin membership)
   * or, if omitted, from the user's first admin gym.
   */
  gymId: string;
  /** True when the admin is also an owner — gates owner-only operations. */
  isOwner: boolean;
};

/**
 * Admin-gated auth check. Confirms the signed-in user is an admin of
 * `gymId` (server-derived, never client-trusted) and returns their role
 * flag so downstream code can branch on owner-only actions without a
 * second round-trip.
 *
 * If `gymId` is omitted the user's first admin gym is used — useful for
 * the dashboard landing page where no gym has been picked yet.
 */
export async function requireGymAdmin(
  gymId?: string
): Promise<AdminAuthSuccess | AuthFailure> {
  const [supabase, user] = await Promise.all([
    createServerSupabase(),
    getServerUser(),
  ]);
  if (!user) {
    return { error: AUTH_REQUIRED_ERROR };
  }

  // If no gym was passed, find one this user admins. Ordering is
  // deterministic (created_at asc) so the landing page is stable across
  // paints; in Phase 2 the admin picker will set an explicit gymId.
  let resolvedGymId = gymId ?? null;
  if (!resolvedGymId) {
    const { data } = await supabase
      .from("gym_admins")
      .select("gym_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    resolvedGymId = data?.gym_id ?? null;
  }

  if (!resolvedGymId) {
    return { error: "You are not an admin of any gym" };
  }

  // Confirm admin membership of the resolved gym. Even if `gymId` was
  // passed in, we verify — client must never dictate gym access.
  const { data: adminRow } = await supabase
    .from("gym_admins")
    .select("role")
    .eq("gym_id", resolvedGymId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return { error: "You are not an admin of that gym" };
  }

  return {
    supabase,
    userId: user.id,
    gymId: resolvedGymId,
    isOwner: adminRow.role === "owner",
  };
}

// ────────────────────────────────────────────────────────────────
// Resource-scoped auth helpers
// ────────────────────────────────────────────────────────────────
//
// Validate the resource id, look up the owning gym/organiser via the
// service role (the caller might not have RLS access yet — we're
// deciding whether they should), then run the matching auth check.
// Returns the authed handle plus the resource row so callers don't
// re-fetch it.
//
// Centralised here so cross-resource ownership rules live in one
// auditable place — see CLAUDE.md "Security-first review".

type AdminOfSetSuccess = {
  auth: AdminAuthSuccess;
  setRow: { gym_id: string };
};

export async function requireAdminOfSet(
  setId: string,
): Promise<AdminOfSetSuccess | AuthFailure> {
  if (!UUID_RE.test(setId)) return { error: "Invalid set." };
  const service = createServiceClient();
  const { data: setRow } = await service
    .from("sets")
    .select("gym_id")
    .eq("id", setId)
    .maybeSingle();
  if (!setRow) return { error: "Set not found." };
  const auth = await requireGymAdmin(setRow.gym_id);
  if ("error" in auth) return { error: auth.error };
  return { auth, setRow };
}

type AdminOfRouteSuccess = {
  auth: AdminAuthSuccess;
  routeRow: { id: string; set_id: string; gym_id: string };
};

export async function requireAdminOfRoute(
  routeId: string,
): Promise<AdminOfRouteSuccess | AuthFailure> {
  if (!UUID_RE.test(routeId)) return { error: "Invalid route." };
  const service = createServiceClient();
  const { data: routeRow } = await service
    .from("routes")
    .select("id, set_id, sets!inner(gym_id)")
    .eq("id", routeId)
    .maybeSingle<{
      id: string;
      set_id: string;
      sets: { gym_id: string } | { gym_id: string }[];
    }>();
  if (!routeRow) return { error: "Route not found." };
  const gymId = Array.isArray(routeRow.sets)
    ? routeRow.sets[0]?.gym_id
    : routeRow.sets?.gym_id;
  if (!gymId) return { error: "Route not found." };
  const auth = await requireGymAdmin(gymId);
  if ("error" in auth) return { error: auth.error };
  return { auth, routeRow: { id: routeRow.id, set_id: routeRow.set_id, gym_id: gymId } };
}

type SignedInSuccess = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/**
 * Confirms the caller is the organiser of the given competition.
 * Reads `competitions.organiser_id` via the service role since the
 * RLS policy on `competitions` is membership-scoped, not organiser-
 * scoped — a comp can span gyms the organiser doesn't admin.
 */
export async function requireCompetitionOrganiser(
  competitionId: string,
): Promise<SignedInSuccess | AuthFailure> {
  if (!UUID_RE.test(competitionId)) return { error: "Invalid competition." };
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const service = createServiceClient();
  const { data: comp } = await service
    .from("competitions")
    .select("organiser_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return { error: "Competition not found." };
  if (comp.organiser_id !== auth.userId) {
    return { error: "Only the organiser can manage this competition." };
  }
  return auth;
}

/**
 * Single-line gate for climber-side mutations. Validates the resource
 * UUID, runs requireAuth (gym-scoped), and applies the standard
 * write-rate-limit. Most route_log + comment mutations in
 * `(app)/actions.ts` open with this prelude — the helper keeps it
 * consistent and prevents an action from quietly skipping the
 * rate-limit step.
 *
 * `resourceLabel` shapes the error message ("Invalid route" / "Invalid
 * comment") so callers can keep their existing user-facing wording.
 *
 * Inline checks unique to one action (e.g. logId UUID, attempts range,
 * grade bounds) stay at the call site after the gate returns success.
 */
export async function gateClimberMutation(
  resourceId: string,
  resourceLabel: string,
): Promise<AuthSuccess | AuthFailure> {
  if (!UUID_RE.test(resourceId)) return { error: `Invalid ${resourceLabel}` };
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const rl = await enforceRateLimit("mutationsWrite", auth.userId);
  if (!rl.ok) return { error: rl.error };
  return auth;
}
