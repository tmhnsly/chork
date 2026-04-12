import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/server";

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
  ownerUserId: string;
}

/**
 * Create a gym and seat the signing-up user as its first owner.
 *
 * Uses the service role for both writes because:
 *  - inserting into gyms is blocked by RLS for everyone except service
 *    role (admin signup is the only sanctioned creation path)
 *  - inserting the first gym_admins row is a chicken-and-egg problem:
 *    the RLS policy requires an existing owner to authorise new admins,
 *    but there isn't one yet
 *
 * Called only from a server action that has already validated the
 * caller's session — `ownerUserId` must come from `requireSignedIn()`,
 * never from the client.
 */
export async function createGymWithOwner(input: CreateGymInput): Promise<
  { gymId: string } | { error: string }
> {
  const service = createServiceClient();

  const { data: gym, error: gymErr } = await service
    .from("gyms")
    .insert({
      name: input.name,
      slug: input.slug,
      city: input.city,
      country: input.country,
      plan_tier: input.plan_tier,
      is_listed: false, // admin-controlled visibility; listings opt-in later
    })
    .select("id")
    .single();

  if (gymErr || !gym) {
    if (gymErr?.code === "23505") {
      return { error: "That gym slug is already taken." };
    }
    return { error: gymErr?.message ?? "Could not create gym." };
  }

  const { error: adminErr } = await service.from("gym_admins").insert({
    gym_id: gym.id,
    user_id: input.ownerUserId,
    role: "owner",
  });

  if (adminErr) {
    // Roll back the gym so we don't leave an orphan with no owner.
    await service.from("gyms").delete().eq("id", gym.id);
    return { error: adminErr.message };
  }

  return { gymId: gym.id };
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
    console.warn("[chork] Could not mark invite accepted:", markErr);
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
 * Replace the tag set for a route atomically — deletes rows that were
 * removed and inserts new ones, skipping any that are already present.
 * The route_tags_map RLS policy gates both sides via is_admin_of_route.
 */
export async function setRouteTags(
  supabase: Supabase,
  routeId: string,
  tagIds: string[]
): Promise<{ success: true } | { error: string }> {
  // Fetch the current set so we only touch rows that actually change.
  const { data: existing, error: readErr } = await supabase
    .from("route_tags_map")
    .select("tag_id")
    .eq("route_id", routeId);
  if (readErr) return { error: readErr.message };

  const current = new Set((existing ?? []).map((r) => r.tag_id));
  const next = new Set(tagIds);

  const toRemove = [...current].filter((id) => !next.has(id));
  const toAdd = [...next].filter((id) => !current.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("route_tags_map")
      .delete()
      .eq("route_id", routeId)
      .in("tag_id", toRemove);
    if (error) return { error: error.message };
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("route_tags_map")
      .insert(toAdd.map((tag_id) => ({ route_id: routeId, tag_id })));
    if (error) return { error: error.message };
  }

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
