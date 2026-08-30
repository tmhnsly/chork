import "server-only";
import {
  createServerSupabase,
  createServiceClient,
  getServerUser,
  getServerProfile,
} from "./supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { AUTH_REQUIRED_ERROR, NO_GYM_ERROR } from "./auth-errors";
import { UUID_RE } from "./validation";
import { one } from "./data/read";
import { enforce as enforceRateLimit, type LimiterKey as RateLimitKey } from "./rate-limit";

type AuthSuccess = {
  supabase: SupabaseClient<Database>;
  userId: string;
  gymId: string;
};
type AuthFailure = { error: string };

/**
 * The rate-limit knob every gate below shares.
 *
 * `null` means "this call is a read". Pages hit the same resource
 * gates as mutations do — `requireAdminOfSet` decides `notFound()` vs
 * `redirect()` for the set screens — and a page view must never spend
 * write budget. Actions pass a bucket. The default is `null` on the
 * resource gates only because pages outnumber actions there; a write
 * action that leaves it null is refused by `action-hygiene.test.ts`,
 * which is what stops this from becoming the 2026-08 failure again
 * (sixteen writes with no limit because each one re-typed the prelude
 * by hand).
 */
type GateOptions = { rateLimit: RateLimitKey | null };
const READ_ONLY: GateOptions = { rateLimit: null };

async function applyRateLimit(
  options: GateOptions,
  userId: string,
): Promise<AuthFailure | null> {
  if (options.rateLimit === null) return null;
  const rl = await enforceRateLimit(options.rateLimit, userId);
  return rl.ok ? null : { error: rl.error };
}

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
    return { error: NO_GYM_ERROR };
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

/**
 * Why a resource gate refused.
 *
 * Server actions only need the message, but PAGES have to choose
 * between `notFound()` and `redirect()` — and the difference matters:
 * a 404 for a set that exists but isn't yours is right, a 404 for
 * "you're not an admin" should send you home instead. Branching on
 * this beats matching the user-facing copy, which reworded is a
 * silently-changed redirect (see NO_GYM_ERROR for the same lesson).
 */
export type ResourceGateReason =
  | "invalid"
  | "not-found"
  | "forbidden"
  | "rate-limited";

export type ResourceGateFailure = AuthFailure & {
  reason: ResourceGateReason;
};

export async function requireAdminOfSet(
  setId: string,
  options: GateOptions = READ_ONLY,
): Promise<AdminOfSetSuccess | ResourceGateFailure> {
  if (!UUID_RE.test(setId)) {
    return { error: "Invalid set.", reason: "invalid" };
  }
  const service = createServiceClient();
  const { data: setRow } = await service
    .from("sets")
    .select("gym_id, owner_kind")
    .eq("id", setId)
    .maybeSingle();
  if (!setRow) return { error: "Set not found.", reason: "not-found" };
  // `sets` hosts climber-run Matches since the convergence (migration
  // 080) and those have no gym, so there is no gym admin who owns
  // one. This gate answers "may you administer this Set?" — for a
  // Match the answer is nobody, and it collapses to not-found so the
  // admin surface can't be used to probe for Matches either.
  if (setRow.owner_kind !== "gym" || !setRow.gym_id) {
    return { error: "Set not found.", reason: "not-found" };
  }
  const auth = await requireGymAdmin(setRow.gym_id);
  if ("error" in auth) return { error: auth.error, reason: "forbidden" };
  const limited = await applyRateLimit(options, auth.userId);
  if (limited) return { ...limited, reason: "rate-limited" };
  return { auth, setRow: { gym_id: setRow.gym_id } };
}

type AdminOfRouteSuccess = {
  auth: AdminAuthSuccess;
  routeRow: { id: string; set_id: string; gym_id: string };
};

export async function requireAdminOfRoute(
  routeId: string,
  options: GateOptions = READ_ONLY,
): Promise<AdminOfRouteSuccess | ResourceGateFailure> {
  if (!UUID_RE.test(routeId)) {
    return { error: "Invalid route.", reason: "invalid" };
  }
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
  if (!routeRow) return { error: "Route not found.", reason: "not-found" };
  const gymId = one(routeRow.sets)?.gym_id;
  if (!gymId) return { error: "Route not found.", reason: "not-found" };
  const auth = await requireGymAdmin(gymId);
  if ("error" in auth) return { error: auth.error, reason: "forbidden" };
  const limited = await applyRateLimit(options, auth.userId);
  if (limited) return { ...limited, reason: "rate-limited" };
  return { auth, routeRow: { id: routeRow.id, set_id: routeRow.set_id, gym_id: gymId } };
}

type SignedInSuccess = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/**
 * Cross-gym scope gate for read actions that expose another climber's
 * data: verifies the set belongs to the caller's gym AND the target
 * user is a member of that gym.
 *
 * The set check alone isn't enough: if a target user once logged on a
 * route that has since moved between gyms (or any shared-set edge
 * case), a gym-A caller could enumerate gym-B climber UUIDs and read
 * their sanitised logs. Both checks together are the defence.
 *
 * This 20-line block used to live copy-pasted in
 * `fetchClimberSheetLogs` and `fetchSetPlacement`, coupled only by a
 * comment ("Same defence as…") — a drift here is a cross-gym data
 * exposure, so it gets one auditable home (see CLAUDE.md
 * "Security-first review").
 *
 * Runs on the caller's RLS-scoped client — no service role needed;
 * both lookups are within the caller's own gym visibility.
 */
export async function requireSameGymScope(
  supabase: SupabaseClient<Database>,
  callerGymId: string,
  setId: string,
  targetUserId: string,
): Promise<{ ok: true } | AuthFailure> {
  const { data: setRow, error: setError } = await supabase
    .from("sets")
    .select("gym_id")
    .eq("id", setId)
    .maybeSingle();
  if (setError || !setRow || setRow.gym_id !== callerGymId) {
    return { error: "Set not found" };
  }

  const { data: membership } = await supabase
    .from("gym_memberships")
    .select("user_id")
    .eq("user_id", targetUserId)
    .eq("gym_id", callerGymId)
    .maybeSingle();
  if (!membership) {
    return { error: "Climber not in this gym" };
  }

  return { ok: true };
}

/**
 * Confirms the caller is the organiser of the given competition.
 * Reads `competitions.organiser_id` via the service role since the
 * RLS policy on `competitions` is membership-scoped, not organiser-
 * scoped — a comp can span gyms the organiser doesn't admin.
 */
export async function requireCompetitionOrganiser(
  competitionId: string,
  options: GateOptions = READ_ONLY,
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
  const limited = await applyRateLimit(options, auth.userId);
  if (limited) return limited;
  return auth;
}

type OrganiserOrGymAdminSuccess = {
  supabase: SupabaseClient<Database>;
  userId: string;
  /**
   * Which path matched. Callers don't usually branch on this — both
   * paths are equally authorised for the link/unlink surfaces — but
   * it's surfaced for telemetry + future owner-only escalations.
   */
  role: "organiser" | "gymAdmin";
};

/**
 * Composite gate for cross-resource actions that EITHER the comp
 * organiser OR a gym admin of the linked gym is allowed to perform
 * (currently `linkCompetitionGym` / `unlinkCompetitionGym`).
 *
 * Tries the organiser path first since it's the cheaper round-trip
 * (a single comp lookup vs. the gym admin's admin-row lookup), then
 * falls back to the gym-admin path. Either match wins. RLS still
 * backstops server-side; this helper is defence-in-depth so the
 * action never reaches Supabase if neither role applies.
 */
export async function requireCompetitionOrganiserOrGymAdmin(
  competitionId: string,
  gymId: string,
  options: GateOptions = READ_ONLY,
): Promise<OrganiserOrGymAdminSuccess | AuthFailure> {
  if (!UUID_RE.test(competitionId)) return { error: "Invalid competition." };
  if (!UUID_RE.test(gymId)) return { error: "Invalid gym." };

  // The organiser path is asked as a read: the limit is applied once,
  // below, on whichever path won — otherwise a gym admin who is not
  // the organiser would be charged for the miss AND the hit.
  const asOrganiser = await requireCompetitionOrganiser(competitionId);
  const matched: OrganiserOrGymAdminSuccess | null = !("error" in asOrganiser)
    ? {
        supabase: asOrganiser.supabase,
        userId: asOrganiser.userId,
        role: "organiser",
      }
    : await (async () => {
        const asAdmin = await requireGymAdmin(gymId);
        if ("error" in asAdmin) return null;
        return {
          supabase: asAdmin.supabase,
          userId: asAdmin.userId,
          role: "gymAdmin" as const,
        };
      })();
  if (!matched) return { error: "Not authorised to manage this competition/gym." };
  const limited = await applyRateLimit(options, matched.userId);
  if (limited) return limited;
  return matched;
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

/**
 * Sibling of `gateClimberMutation` for gym-admin server actions.
 * Concentrates the prelude that every gym-admin mutation repeats:
 *   1. UUID validate the supplied `gymId` (label feeds the user-facing
 *      error string so the action keeps its existing wording).
 *   2. Re-verify the caller admins THIS gym via `requireGymAdmin` —
 *      never trust a client-supplied gymId.
 *   3. Optionally enforce a rate-limit bucket (admin actions that get
 *      one — invites, competition creation — share the same shape;
 *      pass `null` to skip).
 *
 * Returns the `AdminAuthSuccess` shape (with `isOwner` and the
 * verified gymId) so callers can branch on owner-only ops without a
 * second round-trip.
 *
 * Inline action-specific checks (slug format, plan-tier allow-list,
 * email shape, role allow-list) stay at the call site after the gate
 * returns — the gate is for the prelude, not for every validation.
 *
 * Note: resource-scoped helpers (`requireAdminOfSet`, `requireAdminOfRoute`)
 * are NOT subsumed here — they need to fetch the resource before they
 * can decide which gym to authorise against, so they own their own
 * shape. Use them directly when an action takes a set/route id rather
 * than a gym id.
 */
export async function gateGymAdminMutation(
  gymId: string,
  resourceLabel: string,
  options: GateOptions = READ_ONLY,
): Promise<AdminAuthSuccess | AuthFailure> {
  if (!UUID_RE.test(gymId)) return { error: `Invalid ${resourceLabel}` };
  const auth = await requireGymAdmin(gymId);
  if ("error" in auth) return { error: auth.error };
  const limited = await applyRateLimit(options, auth.userId);
  if (limited) return limited;
  return auth;
}

/**
 * Third sibling: the gate for signed-in (gymless-safe) mutations —
 * matches, and any future write that must work without an active gym
 * (see CLAUDE.md "A gym is optional").
 *
 *   1. UUID-validate `resourceId` when one is supplied (`null` for
 *      actions like createMatch that validate a payload instead; the
 *      label feeds the user-facing error string).
 *   2. `requireSignedIn` — NOT `requireAuth`; gymless climbers are
 *      first-class here.
 *   3. Rate-limit, ON by default (`mutationsWrite`). This default is
 *      the point: before this gate existed, every match write action
 *      re-typed the requireSignedIn prelude by hand and all seven
 *      skipped the rate limit entirely. Pass `null` only with a
 *      written reason.
 */
export async function gateSignedInMutation(
  resourceId: string | null,
  resourceLabel: string,
  options: GateOptions = { rateLimit: "mutationsWrite" },
): Promise<SignedInSuccess | AuthFailure> {
  if (resourceId !== null && !UUID_RE.test(resourceId)) {
    return { error: `Invalid ${resourceLabel}` };
  }
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const limited = await applyRateLimit(options, auth.userId);
  if (limited) return limited;
  return auth;
}
