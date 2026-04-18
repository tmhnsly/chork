import "server-only";
import {
  createServerSupabase,
  getServerUser,
  getServerProfile,
} from "./supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { AUTH_REQUIRED_ERROR } from "./auth-errors";

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
