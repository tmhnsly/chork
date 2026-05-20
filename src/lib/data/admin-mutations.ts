import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/server";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
type Supabase = SupabaseClient<Database>;

// ────────────────────────────────────────────────────────────────
// Gym creation + first-owner bootstrap
// ────────────────────────────────────────────────────────────────

export interface CreateGymInput {
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  plan_tier: "starter" | "pro" | "enterprise";
}

/**
 * Create a gym and seat the signing-up user as its first owner.
 *
 * Delegates to the create_gym_with_owner_tx Postgres function
 * (migration 061): both inserts (gyms + gym_admins) happen in one
 * implicit transaction, so a failure on the second insert rolls the
 * first back automatically. Prior app-side flow could orphan a gym
 * with no owner if its best-effort DELETE rollback also failed.
 *
 * Auth: the RPC is SECURITY DEFINER and derives the owner uid from
 * auth.uid() inside the function — the caller can't pass a different
 * uid than the auth session's. Pass the authenticated user's
 * supabase client (from requireSignedIn) so auth.uid() resolves
 * correctly inside the function.
 */
export async function createGymWithOwner(
  supabase: Supabase,
  input: CreateGymInput,
): Promise<{ gymId: string } | { error: string }> {
  // Migration 062 reordered the function so p_city / p_country trail
  // p_plan_tier with DEFAULT NULL — the Supabase type generator now
  // marks them as optional. Omit (rather than send null) when the
  // caller passes null so the DB-side defaults take over.
  const { data, error } = await supabase.rpc("create_gym_with_owner_tx", {
    p_name: input.name,
    p_slug: input.slug,
    p_plan_tier: input.plan_tier,
    ...(input.city !== null && { p_city: input.city }),
    ...(input.country !== null && { p_country: input.country }),
  });

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "That gym slug is already taken." };
    }
    return { error: error?.message ?? "Could not create gym." };
  }

  return { gymId: data };
}

// ────────────────────────────────────────────────────────────────
// Invite accept — tx-like flow via service role
// ────────────────────────────────────────────────────────────────

export interface AcceptInviteInput {
  token: string;
  acceptingUserId: string;
  acceptingEmail: string;
}

/**
 * Validate a gym_invites token and upgrade the caller into a
 * gym_admins row. Runs under the service role so the chicken-and-egg
 * check on gym_admins INSERT (which requires an owner) is bypassed
 * once the token has been proven valid.
 */
export async function acceptGymInvite(input: AcceptInviteInput): Promise<
  { gymId: string; role: "admin" | "owner" } | { error: string }
> {
  const service = createServiceClient();

  const { data: invite, error } = await service
    .from("gym_invites")
    .select("id, gym_id, email, role, accepted_at, expires_at")
    .eq("token", input.token)
    .maybeSingle();

  if (error || !invite) {
    return { error: "Invite not found." };
  }
  if (invite.accepted_at) {
    return { error: "This invite has already been used." };
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { error: "This invite has expired." };
  }
  if (invite.email.toLowerCase() !== input.acceptingEmail.toLowerCase()) {
    return { error: "This invite was issued to a different email address." };
  }

  const role = invite.role as "admin" | "owner";

  const { error: adminErr } = await service
    .from("gym_admins")
    .upsert(
      {
        gym_id: invite.gym_id,
        user_id: input.acceptingUserId,
        role,
      },
      { onConflict: "gym_id,user_id" }
    );

  if (adminErr) {
    return { error: adminErr.message };
  }

  const { error: markErr } = await service
    .from("gym_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (markErr) {
    // Admin row is already inserted; this is a minor accounting failure,
    // not a blocker for the invitee.
    logger.warn("could_not_mark_invite_accepted_failed", { err: formatErrorForLog(markErr) });
  }

  return { gymId: invite.gym_id, role };
}

// ────────────────────────────────────────────────────────────────
// Set mutations — gated to authed admin client (RLS enforces)
// ────────────────────────────────────────────────────────────────

export interface CreateSetInput {
  gymId: string;
  name: string | null;
  startsAt: string;
  endsAt: string;
  gradingScale: "v" | "font" | "points";
  maxGrade: number;
  status: "draft" | "live";
  closingEvent: boolean;
  venueGymId: string | null;
  competitionId: string | null;
}

/**
 * Create a set. Caller passes an authed Supabase client so RLS enforces
 * admin membership. Returns the new set id.
 */
export async function createAdminSet(
  supabase: Supabase,
  input: CreateSetInput
): Promise<{ setId: string } | { error: string }> {
  const { data, error } = await supabase
    .from("sets")
    .insert({
      gym_id: input.gymId,
      name: input.name,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      grading_scale: input.gradingScale,
      max_grade: input.maxGrade,
      status: input.status,
      closing_event: input.closingEvent,
      venue_gym_id: input.venueGymId,
      competition_id: input.competitionId,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create set." };
  return { setId: data.id };
}

export interface UpdateSetInput {
  name?: string | null;
  startsAt?: string;
  endsAt?: string;
  gradingScale?: "v" | "font" | "points";
  maxGrade?: number;
  status?: "draft" | "live" | "archived";
  closingEvent?: boolean;
  venueGymId?: string | null;
  competitionId?: string | null;
}

// ────────────────────────────────────────────────────────────────
// Route mutations
// ────────────────────────────────────────────────────────────────

export interface QuickSetupInput {
  setId: string;
  count: number;
  /** Route numbers (1-indexed) that should be flagged as zone-hold routes. */
  zoneRouteNumbers: number[];
}

/**
 * Quick-setup: create `count` routes numbered 1..count on the given set.
 * Idempotent on re-run — existing (set_id, number) rows are untouched
 * thanks to the unique constraint on routes(set_id, number) combined
 * with upsert onConflict. Zone flags are re-applied on every call so
 * admins can quickly correct a miscount.
 */
export async function quickSetupRoutes(
  supabase: Supabase,
  input: QuickSetupInput
): Promise<{ created: number } | { error: string }> {
  if (input.count < 1 || input.count > 100) {
    return { error: "Route count must be between 1 and 100." };
  }

  const zoneSet = new Set(input.zoneRouteNumbers);
  const rows = Array.from({ length: input.count }, (_, i) => ({
    set_id: input.setId,
    number: i + 1,
    has_zone: zoneSet.has(i + 1),
  }));

  const { error, count } = await supabase
    .from("routes")
    .upsert(rows, { onConflict: "set_id,number", count: "exact" });

  if (error) return { error: error.message };
  return { created: count ?? rows.length };
}

export interface UpdateRouteInput {
  number?: number;
  hasZone?: boolean;
  setterName?: string | null;
}

export async function updateAdminRoute(
  supabase: Supabase,
  routeId: string,
  input: UpdateRouteInput
): Promise<{ success: true } | { error: string }> {
  type RouteUpdate = Database["public"]["Tables"]["routes"]["Update"];
  const patch: RouteUpdate = {};
  if (input.number !== undefined) patch.number = input.number;
  if (input.hasZone !== undefined) patch.has_zone = input.hasZone;
  if (input.setterName !== undefined) patch.setter_name = input.setterName;

  const { error } = await supabase.from("routes").update(patch).eq("id", routeId);
  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Replace the tag set for a route atomically. Delegates to the
 * set_route_tags_tx Postgres function (migration 060) so the read +
 * delete + insert happen in one transaction with a FOR UPDATE lock
 * on the route. Prior app-side flow could partial-write if the
 * INSERT step failed after the DELETE step succeeded; the RPC
 * eliminates that window.
 *
 * Auth: the RPC re-checks is_admin_of_route via SECURITY DEFINER,
 * so even if the app caller forgets the requireAdminOfRoute gate
 * the DB still refuses an unauthorised tag overwrite.
 */
export async function setRouteTags(
  supabase: Supabase,
  routeId: string,
  tagIds: string[]
): Promise<{ success: true } | { error: string }> {
  const { error } = await supabase.rpc("set_route_tags_tx", {
    p_route_id: routeId,
    p_tag_ids: tagIds,
  });
  if (error) return { error: error.message };
  return { success: true };
}

// ────────────────────────────────────────────────────────────────
// Competition mutations
// ────────────────────────────────────────────────────────────────

export interface CreateCompetitionInput {
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  organiserId: string;
}

export async function createCompetition(
  supabase: Supabase,
  input: CreateCompetitionInput
): Promise<{ competitionId: string } | { error: string }> {
  const { data, error } = await supabase
    .from("competitions")
    .insert({
      name: input.name,
      description: input.description,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: "draft",
      organiser_id: input.organiserId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create competition." };
  return { competitionId: data.id };
}

export interface UpdateCompetitionInput {
  name?: string;
  description?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  status?: "draft" | "live" | "archived";
}

export async function updateCompetition(
  supabase: Supabase,
  competitionId: string,
  input: UpdateCompetitionInput
): Promise<{ success: true } | { error: string }> {
  type CompetitionUpdate = Database["public"]["Tables"]["competitions"]["Update"];
  const patch: CompetitionUpdate = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
  if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
  if (input.status !== undefined) patch.status = input.status;

  const { error } = await supabase.from("competitions").update(patch).eq("id", competitionId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function linkGymToCompetition(
  supabase: Supabase,
  competitionId: string,
  gymId: string
): Promise<{ success: true } | { error: string }> {
  const { error } = await supabase
    .from("competition_gyms")
    .upsert(
      { competition_id: competitionId, gym_id: gymId },
      { onConflict: "competition_id,gym_id" }
    );
  if (error) return { error: error.message };
  return { success: true };
}

export async function unlinkGymFromCompetition(
  supabase: Supabase,
  competitionId: string,
  gymId: string
): Promise<{ success: true } | { error: string }> {
  const { error } = await supabase
    .from("competition_gyms")
    .delete()
    .eq("competition_id", competitionId)
    .eq("gym_id", gymId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function createCompetitionCategory(
  supabase: Supabase,
  competitionId: string,
  name: string,
  displayOrder: number
): Promise<{ categoryId: string } | { error: string }> {
  const { data, error } = await supabase
    .from("competition_categories")
    .insert({ competition_id: competitionId, name, display_order: displayOrder })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create category." };
  return { categoryId: data.id };
}

export async function deleteCompetitionCategory(
  supabase: Supabase,
  categoryId: string
): Promise<{ success: true } | { error: string }> {
  const { error } = await supabase
    .from("competition_categories")
    .delete()
    .eq("id", categoryId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateAdminSet(
  supabase: Supabase,
  setId: string,
  input: UpdateSetInput
): Promise<{ success: true } | { error: string }> {
  // Type the patch against the generated Database type so Supabase can
  // validate column names. `Partial` lets us only include keys the
  // caller actually supplied (omitted fields stay as-is in the DB).
  type SetUpdate = Database["public"]["Tables"]["sets"]["Update"];
  const patch: SetUpdate = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
  if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
  if (input.gradingScale !== undefined) patch.grading_scale = input.gradingScale;
  if (input.maxGrade !== undefined) patch.max_grade = input.maxGrade;
  if (input.status !== undefined) patch.status = input.status;
  if (input.closingEvent !== undefined) patch.closing_event = input.closingEvent;
  if (input.venueGymId !== undefined) patch.venue_gym_id = input.venueGymId;
  if (input.competitionId !== undefined) patch.competition_id = input.competitionId;

  const { error } = await supabase.from("sets").update(patch).eq("id", setId);
  if (error) return { error: error.message };
  return { success: true };
}
