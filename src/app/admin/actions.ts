"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireGymAdmin, requireSignedIn } from "@/lib/auth";
import {
  createGymWithOwner,
  acceptGymInvite,
  createAdminSet,
  updateAdminSet,
} from "@/lib/data/admin-mutations";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError } from "@/lib/errors";
import { randomBytes } from "node:crypto";

type ActionResult<T = unknown> = { error: string } | ({ success: true } & T);

// Slugs: lowercase letters, digits, single hyphens. Matches the same
// shape the app already uses for gym slugs (see migration 001).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

  revalidatePath("/admin", "layout");
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

  const { error } = await auth.supabase.from("gym_invites").upsert(
    {
      gym_id: gymId,
      email,
      role: form.role,
      token,
      invited_by: userId,
      invited_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
    },
    { onConflict: "gym_id,email" }
  );

  if (error) return { error: formatError(error) };

  revalidatePath("/admin", "layout");

  // The server action returns the URL so the caller (admin UI) can show
  // a copy-link button. Email delivery wiring lands with the push /
  // notifications infrastructure in a subsequent phase.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return { success: true, inviteUrl: `${baseUrl}/admin/invite/${token}` };
}

export async function cancelAdminInvite(inviteId: string): Promise<ActionResult> {
  if (!UUID_RE.test(inviteId)) return { error: "Invalid invite." };

  // Ownership check: look up the invite's gym, verify caller admins it.
  const service = createServiceClient();
  const { data: invite } = await service
    .from("gym_invites")
    .select("gym_id")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return { error: "Invite not found." };

  const auth = await requireGymAdmin(invite.gym_id);
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase.from("gym_invites").delete().eq("id", inviteId);
  if (error) return { error: formatError(error) };

  revalidatePath("/admin", "layout");
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

  revalidatePath("/admin", "layout");
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

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout"); // climber pages see the new set if it went live
  return { success: true, setId: result.setId };
}

export async function updateSet(
  setId: string,
  form: Partial<SetFormInput>
): Promise<ActionResult> {
  if (!UUID_RE.test(setId)) return { error: "Invalid set." };

  // Ownership check: confirm caller admins the gym that owns this set.
  const service = createServiceClient();
  const { data: setRow } = await service
    .from("sets")
    .select("gym_id")
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

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
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
