"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireGymAdmin, requireSignedIn } from "@/lib/auth";
import {
  createGymWithOwner,
  acceptGymInvite,
  createAdminSet,
  updateAdminSet,
  quickSetupRoutes,
  updateAdminRoute,
  setRouteTags,
  createCompetition,
  updateCompetition,
  linkGymToCompetition,
  unlinkGymFromCompetition,
  createCompetitionCategory,
  deleteCompetitionCategory,
} from "@/lib/data/admin-mutations";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";
import { getGym } from "@/lib/data/queries";
import { formatSetLabel } from "@/lib/data/set-label";
import { getGymClimberUserIds, sendPushInBackground } from "@/lib/push/server";
import { randomBytes } from "node:crypto";

type ActionResult<T = unknown> = { error: string } | ({ success: true } & T);

// Slugs: lowercase letters, digits, single hyphens. Matches the same
// shape the app already uses for gym slugs (see migration 001).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ────────────────────────────────────────────────────────────────
// Gym signup — new admin creates a gym
// ────────────────────────────────────────────────────────────────

export async function signupGym(form: {
  name: string;
  slug: string;
  city: string;
  country: string;
  planTier: "starter" | "pro" | "enterprise";
}): Promise<ActionResult<{ gymId: string }>> {
  const name = (form.name ?? "").trim();
  const slug = (form.slug ?? "").trim().toLowerCase();
  const city = (form.city ?? "").trim() || null;
  const country = (form.country ?? "").trim() || null;
  const planTier = form.planTier;

  if (name.length < 2 || name.length > 80) {
    return { error: "Gym name must be 2–80 characters." };
  }
  if (!SLUG_RE.test(slug)) {
    return { error: "Slug must be lowercase letters, digits, and hyphens." };
  }
  if (!["starter", "pro", "enterprise"].includes(planTier)) {
    return { error: "Invalid plan tier." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  const result = await createGymWithOwner({
    name,
    slug,
    city,
    country,
    plan_tier: planTier,
    ownerUserId: auth.userId,
  });

  if ("error" in result) return { error: result.error };

  // signupGym writes a new gyms row + an admin seat, but doesn't touch
  // profiles.* — getAdminGymsForUser is uncached and re-fetches via the
  // server action's response cycle, so no profile-tag bust required.
  return { success: true, gymId: result.gymId };
}

// ────────────────────────────────────────────────────────────────
// Invites
// ────────────────────────────────────────────────────────────────

export async function sendAdminInvite(form: {
  gymId: string;
  email: string;
  role: "admin" | "owner";
}): Promise<ActionResult<{ inviteUrl: string }>> {
  if (!UUID_RE.test(form.gymId)) return { error: "Invalid gym." };
  const email = (form.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!["admin", "owner"].includes(form.role)) {
    return { error: "Invalid role." };
  }

  const auth = await requireGymAdmin(form.gymId);
  if ("error" in auth) return { error: auth.error };
  const { userId, gymId } = auth;

  // Only owners can issue owner-level invites. Admins can invite peers.
  if (form.role === "owner" && !auth.isOwner) {
    return { error: "Only owners can invite other owners." };
  }

  // Opaque, URL-safe, single-use token. 32 bytes → 43 chars base64url.
  const token = randomBytes(32).toString("base64url");

  // Both timestamps are app-supplied rather than relying on column
  // defaults. The column defaults (migration 014: `now()` and
  // `now() + interval '14 days'`) only fire on INSERT, not UPDATE —
  // and this is an upsert on (gym_id, email). The "admin re-invites
  // the same email after expiry" flow has to refresh the window, so
  // on the UPDATE path we need to overwrite `expires_at` explicitly;
  // omitting it would leave the original (possibly expired) value
  // in place and quietly make the re-invite useless.
  //
  // Node clock drift is minor on Vercel (NTP-synced fleet) and the
  // regression-on-omission is worse than the drift risk.
  const now = new Date();
  const { error } = await auth.supabase.from("gym_invites").upsert(
    {
      gym_id: gymId,
      email,
      role: form.role,
      token,
      invited_by: userId,
      invited_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
    },
    { onConflict: "gym_id,email" }
  );

  if (error) return { error: formatError(error) };

  // gym_invites isn't in the cache layer; the admin invites list
  // re-fetches automatically via the server action's response cycle.
  // No revalidateTag needed.

  // The server action returns the URL so the caller (admin UI) can show
  // a copy-link button. Email delivery wiring lands with the push /
  // notifications infrastructure in a subsequent phase.
  //
  // Fallback matches the other call sites (layout.tsx, robots.ts,
  // sitemap.ts, login/actions.ts). An empty-string fallback here
  // would produce a relative URL like `/admin/invite/<token>` that
  // the admin would then try to paste into a chat — the other side
  // has no way to resolve that. Use the canonical prod host so the
  // link is always copy-pasteable even when `NEXT_PUBLIC_SITE_URL`
  // is unset locally.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chork.vercel.app";
  return { success: true, inviteUrl: `${baseUrl}/admin/invite/${token}` };
}

export async function cancelAdminInvite(inviteId: string): Promise<ActionResult> {
  if (!UUID_RE.test(inviteId)) return { error: "Invalid invite." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  // gym_invites DELETE is RLS-gated to `is_gym_admin(gym_id)` (migration
  // 014), so one atomic delete + returning both authorises AND executes
  // the action — no separate service-role lookup, no TOCTOU window
  // between "check admin" and "delete". `.select("id")` tells the
  // client to return affected rows; empty array == "not found OR not
  // authorised" (we collapse the two so we don't leak invite existence).
  const { data, error } = await auth.supabase
    .from("gym_invites")
    .delete()
    .eq("id", inviteId)
    .select("id");
  if (error) return { error: formatError(error) };
  if (!data || data.length === 0) return { error: "Invite not found." };

  return { success: true };
}

export async function acceptAdminInvite(token: string): Promise<ActionResult<{ gymId: string }>> {
  if (typeof token !== "string" || token.length < 20) {
    return { error: "Invalid invite link." };
  }
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  const service = createServiceClient();
  const { data: user } = await service.auth.admin.getUserById(auth.userId);
  const email = user?.user?.email;
  if (!email) return { error: "Could not read your email address." };

  const result = await acceptGymInvite({
    token,
    acceptingUserId: auth.userId,
    acceptingEmail: email,
  });
  if ("error" in result) return { error: result.error };

  // Same reasoning as signupGym — gym_admins isn't cached and adminGyms
  // re-fetches via the action response. Profile row unchanged.
  return { success: true, gymId: result.gymId };
}

// ────────────────────────────────────────────────────────────────
// Sets
// ────────────────────────────────────────────────────────────────

// Status widens to include "archived" on update (archive action). On
// create only draft/live make sense.
type SetStatus = "draft" | "live" | "archived";

interface SetFormInput {
  gymId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  gradingScale: "v" | "font" | "points";
  maxGrade: number;
  status: SetStatus;
  closingEvent?: boolean;
  venueGymId?: string | null;
  competitionId?: string | null;
}

function validateSetInput(form: SetFormInput): string | null {
  if (!UUID_RE.test(form.gymId)) return "Invalid gym.";
  if (!form.startsAt || !form.endsAt) return "Start and end dates are required.";
  if (new Date(form.startsAt) > new Date(form.endsAt)) {
    return "End date must be on or after the start date.";
  }
  if (!["v", "font", "points"].includes(form.gradingScale)) {
    return "Invalid grading scale.";
  }
  if (!Number.isInteger(form.maxGrade) || form.maxGrade < 0 || form.maxGrade > 30) {
    return "Max grade must be between 0 and 30.";
  }
  if (!["draft", "live", "archived"].includes(form.status)) return "Invalid status.";
  return null;
}

export async function createSet(
  form: SetFormInput
): Promise<ActionResult<{ setId: string }>> {
  // Create-time: force status into {draft, live} — you can't conjure an
  // archived set from thin air.
  if (form.status === "archived") form.status = "draft";
  const validation = validateSetInput(form);
  if (validation) return { error: validation };

  const auth = await requireGymAdmin(form.gymId);
  if ("error" in auth) return { error: auth.error };

  const result = await createAdminSet(auth.supabase, {
    gymId: form.gymId,
    name: form.name.trim() || null,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    gradingScale: form.gradingScale,
    maxGrade: form.maxGrade,
    // Status is narrowed above — archived is rewritten to draft.
    status: form.status as "draft" | "live",
    closingEvent: !!form.closingEvent,
    venueGymId: form.venueGymId ?? null,
    competitionId: form.competitionId ?? null,
  });
  if ("error" in result) return { error: result.error };

  revalidateTag(`gym:${form.gymId}:active-set`);
  return { success: true, setId: result.setId };
}

export async function updateSet(
  setId: string,
  form: Partial<SetFormInput>
): Promise<ActionResult> {
  if (!UUID_RE.test(setId)) return { error: "Invalid set." };

  // Ownership check: confirm caller admins the gym that owns this set.
  // Also read the previous status + set name so we can detect the
  // draft→live transition and dispatch notifications below.
  const service = createServiceClient();
  const { data: setRow } = await service
    .from("sets")
    .select("gym_id, status, name, starts_at, ends_at")
    .eq("id", setId)
    .maybeSingle();
  if (!setRow) return { error: "Set not found." };

  const auth = await requireGymAdmin(setRow.gym_id);
  if ("error" in auth) return { error: auth.error };

  const result = await updateAdminSet(auth.supabase, setId, {
    name: form.name?.trim() || null,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    gradingScale: form.gradingScale,
    maxGrade: form.maxGrade,
    status: form.status,
    closingEvent: form.closingEvent,
    venueGymId: form.venueGymId,
    competitionId: form.competitionId,
  });
  if ("error" in result) return { error: result.error };

  // Draft → live transition: notify every climber who has logged at
  // this gym. Fan-out can be hundreds of endpoints — dispatch
  // *after* the response is sent so the admin's publish click
  // returns immediately instead of waiting on web-push round-trips.
  if (setRow.status !== "live" && form.status === "live") {
    try {
      const [userIds, gym] = await Promise.all([
        getGymClimberUserIds(setRow.gym_id),
        getGym(setRow.gym_id),
      ]);
      if (userIds.length > 0) {
        sendPushInBackground(userIds, {
          title: `New set at ${gym?.name ?? "your gym"}`,
          body: `${formatSetLabel({ name: form.name ?? setRow.name, starts_at: form.startsAt ?? setRow.starts_at, ends_at: form.endsAt ?? setRow.ends_at })} is now live. Get climbing.`,
          url: "/",
        });
      }
    } catch (err) {
      console.warn("[chork] set-live push preparation failed:", err);
    }
  }

  revalidateTag(`gym:${setRow.gym_id}:active-set`);
  // Status transitions affect leaderboard semantics for the set.
  revalidateTag(`set:${setId}:leaderboard`);
  return { success: true };
}

export async function archiveSet(setId: string): Promise<ActionResult> {
  return updateSet(setId, { status: "archived" });
}

export async function publishSet(setId: string): Promise<ActionResult> {
  return updateSet(setId, { status: "live" });
}

export async function unpublishSet(setId: string): Promise<ActionResult> {
  return updateSet(setId, { status: "draft" });
}

// ────────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────────

// Explicit return types so discriminated-union narrowing via
// `"error" in gate` reliably exposes `gate.error: string` (without the
// explicit return type, `as const` literals on each branch trick TS
// into seeing `error` as optionally-undefined on the union).

async function verifyAdminOfSet(setId: string): Promise<
  { error: string } | { auth: Extract<Awaited<ReturnType<typeof requireGymAdmin>>, { gymId: string }>; setRow: { gym_id: string } }
> {
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

async function verifyAdminOfRoute(routeId: string): Promise<
  { error: string } | { auth: Extract<Awaited<ReturnType<typeof requireGymAdmin>>, { gymId: string }>; routeRow: { id: string; set_id: string; gym_id: string } }
> {
  if (!UUID_RE.test(routeId)) return { error: "Invalid route." };
  const service = createServiceClient();
  const { data: routeRow } = await service
    .from("routes")
    .select("id, set_id, sets!inner(gym_id)")
    .eq("id", routeId)
    .maybeSingle<{ id: string; set_id: string; sets: { gym_id: string } | { gym_id: string }[] }>();
  if (!routeRow) return { error: "Route not found." };
  const gymId = Array.isArray(routeRow.sets) ? routeRow.sets[0]?.gym_id : routeRow.sets?.gym_id;
  if (!gymId) return { error: "Route not found." };
  const auth = await requireGymAdmin(gymId);
  if ("error" in auth) return { error: auth.error };
  return { auth, routeRow: { id: routeRow.id, set_id: routeRow.set_id, gym_id: gymId } };
}

export async function quickSetupSetRoutes(form: {
  setId: string;
  count: number;
  zoneRouteNumbers: number[];
}): Promise<ActionResult<{ created: number }>> {
  if (!Number.isInteger(form.count) || form.count < 1 || form.count > 100) {
    return { error: "Route count must be between 1 and 100." };
  }
  if (!Array.isArray(form.zoneRouteNumbers)) {
    return { error: "Invalid zone route list." };
  }
  const gate = await verifyAdminOfSet(form.setId);
  if ("error" in gate) return { error: gate.error };

  const result = await quickSetupRoutes(gate.auth.supabase, {
    setId: form.setId,
    count: form.count,
    zoneRouteNumbers: form.zoneRouteNumbers.filter((n) => Number.isInteger(n) && n > 0 && n <= form.count),
  });
  if ("error" in result) return { error: result.error };

  revalidateTag(`set:${form.setId}:routes`);
  return { success: true, created: result.created };
}

export async function updateRoute(
  routeId: string,
  form: {
    number?: number;
    hasZone?: boolean;
    setterName?: string | null;
  }
): Promise<ActionResult> {
  const gate = await verifyAdminOfRoute(routeId);
  if ("error" in gate) return { error: gate.error };

  if (form.number !== undefined && (!Number.isInteger(form.number) || form.number < 1 || form.number > 999)) {
    return { error: "Route number must be between 1 and 999." };
  }
  if (form.setterName !== undefined && form.setterName !== null) {
    const trimmed = form.setterName.trim();
    if (trimmed.length > 80) return { error: "Setter name too long." };
    form.setterName = trimmed || null;
  }

  const result = await updateAdminRoute(gate.auth.supabase, routeId, form);
  if ("error" in result) return { error: result.error };

  revalidateTag(`set:${gate.routeRow.set_id}:routes`);
  revalidateTag(`route:${routeId}:grade`);
  return { success: true };
}

export async function updateRouteTags(
  routeId: string,
  tagIds: string[]
): Promise<ActionResult> {
  const gate = await verifyAdminOfRoute(routeId);
  if ("error" in gate) return { error: gate.error };

  if (!Array.isArray(tagIds) || tagIds.some((t) => !UUID_RE.test(t))) {
    return { error: "Invalid tag list." };
  }

  const result = await setRouteTags(gate.auth.supabase, routeId, tagIds);
  if ("error" in result) return { error: result.error };

  revalidateTag(`set:${gate.routeRow.set_id}:routes`);
  return { success: true };
}

// ────────────────────────────────────────────────────────────────
// Competitions
// ────────────────────────────────────────────────────────────────
// Create/update gated on the caller being the organiser (stored as
// organiser_id on the row). Linking gyms OR admins of the gym being
// linked are both allowed via RLS, so the server action just passes
// through and lets Postgres enforce.

export async function createNewCompetition(form: {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
}): Promise<ActionResult<{ competitionId: string }>> {
  const name = (form.name ?? "").trim();
  if (name.length < 1 || name.length > 120) return { error: "Name must be 1–120 characters." };
  if (!form.startsAt) return { error: "Start date is required." };
  if (form.endsAt && new Date(form.startsAt) > new Date(form.endsAt)) {
    return { error: "End date must be on or after the start date." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  const result = await createCompetition(auth.supabase, {
    name,
    description: form.description?.trim() || null,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    organiserId: auth.userId,
  });
  if ("error" in result) return { error: result.error };

  revalidateTag(`competition:${result.competitionId}`);
  return { success: true, competitionId: result.competitionId };
}

async function verifyCompetitionOrganiser(competitionId: string): Promise<
  { error: string } | Extract<Awaited<ReturnType<typeof requireSignedIn>>, { supabase: unknown }>
> {
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

export async function updateCompetitionAction(
  competitionId: string,
  form: {
    name?: string;
    description?: string | null;
    startsAt?: string;
    endsAt?: string | null;
    status?: "draft" | "live" | "archived";
  }
): Promise<ActionResult> {
  const gate = await verifyCompetitionOrganiser(competitionId);
  if ("error" in gate) return { error: gate.error };

  if (form.name !== undefined) {
    const trimmed = form.name.trim();
    if (trimmed.length < 1 || trimmed.length > 120) return { error: "Name must be 1–120 characters." };
    form.name = trimmed;
  }
  if (form.endsAt !== undefined && form.startsAt !== undefined && form.endsAt && new Date(form.startsAt) > new Date(form.endsAt)) {
    return { error: "End date must be on or after the start date." };
  }
  if (form.status !== undefined && !["draft", "live", "archived"].includes(form.status)) {
    return { error: "Invalid status." };
  }

  const result = await updateCompetition(gate.supabase, competitionId, form);
  if ("error" in result) return { error: result.error };

  revalidateTag(`competition:${competitionId}`);
  return { success: true };
}

// Linking/unlinking a gym is allowed for either the comp organiser
// OR an admin of that gym. Server-side we require at least one of
// the two to match before touching the DB — RLS is the ultimate
// backstop but we never want to lean on it alone (the policy can
// change, bugs happen, and defence in depth is cheap here).
async function ensureOrganiserOrGymAdmin(
  competitionId: string,
  gymId: string,
): Promise<ActionResult> {
  const asOrganiser = await verifyCompetitionOrganiser(competitionId);
  if ("error" in asOrganiser) {
    const asAdmin = await requireGymAdmin(gymId);
    if ("error" in asAdmin) {
      return { error: "Not authorised to manage this competition/gym." };
    }
  }
  return { success: true };
}

export async function linkCompetitionGym(form: {
  competitionId: string;
  gymId: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(form.competitionId)) return { error: "Invalid competition." };
  if (!UUID_RE.test(form.gymId)) return { error: "Invalid gym." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  const gate = await ensureOrganiserOrGymAdmin(form.competitionId, form.gymId);
  if ("error" in gate) return { error: gate.error };

  const result = await linkGymToCompetition(auth.supabase, form.competitionId, form.gymId);
  if ("error" in result) return { error: result.error };

  revalidateTag(`competition:${form.competitionId}`);
  return { success: true };
}

export async function unlinkCompetitionGym(form: {
  competitionId: string;
  gymId: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(form.competitionId)) return { error: "Invalid competition." };
  if (!UUID_RE.test(form.gymId)) return { error: "Invalid gym." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };

  const gate = await ensureOrganiserOrGymAdmin(form.competitionId, form.gymId);
  if ("error" in gate) return { error: gate.error };

  const result = await unlinkGymFromCompetition(auth.supabase, form.competitionId, form.gymId);
  if ("error" in result) return { error: result.error };

  revalidateTag(`competition:${form.competitionId}`);
  return { success: true };
}

export async function addCompetitionCategory(form: {
  competitionId: string;
  name: string;
  displayOrder?: number;
}): Promise<ActionResult<{ categoryId: string }>> {
  const gate = await verifyCompetitionOrganiser(form.competitionId);
  if ("error" in gate) return { error: gate.error };

  const name = (form.name ?? "").trim();
  if (name.length < 1 || name.length > 60) return { error: "Name must be 1–60 characters." };

  const result = await createCompetitionCategory(
    gate.supabase,
    form.competitionId,
    name,
    form.displayOrder ?? 0
  );
  if ("error" in result) return { error: result.error };

  revalidateTag(`competition:${form.competitionId}`);
  return { success: true, categoryId: result.categoryId };
}

export async function removeCompetitionCategory(categoryId: string): Promise<ActionResult> {
  if (!UUID_RE.test(categoryId)) return { error: "Invalid category." };

  // Resolve the parent competition for ownership check — the category
  // row itself doesn't carry organiser_id.
  const service = createServiceClient();
  const { data: cat } = await service
    .from("competition_categories")
    .select("competition_id")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat) return { error: "Category not found." };

  const gate = await verifyCompetitionOrganiser(cat.competition_id);
  if ("error" in gate) return { error: gate.error };

  const result = await deleteCompetitionCategory(gate.supabase, categoryId);
  if ("error" in result) return { error: result.error };

  revalidateTag(`competition:${cat.competition_id}`);
  return { success: true };
}

// ────────────────────────────────────────────────────────────────
// Redirect helper — used by onboarding after success
// ────────────────────────────────────────────────────────────────

export async function signupGymAndRedirect(form: {
  name: string;
  slug: string;
  city: string;
  country: string;
  planTier: "starter" | "pro" | "enterprise";
}): Promise<void> {
  const res = await signupGym(form);
  if ("error" in res) {
    throw new Error(res.error);
  }
  redirect("/admin");
}
