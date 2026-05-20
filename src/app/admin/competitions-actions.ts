"use server";

import { revalidateTag } from "next/cache";
import {
  requireCompetitionOrganiser,
  requireCompetitionOrganiserOrGymAdmin,
  requireSignedIn,
} from "@/lib/auth";
import {
  createCompetition,
  createCompetitionCategory,
  deleteCompetitionCategory,
  linkGymToCompetition,
  unlinkGymFromCompetition,
  updateCompetition,
} from "@/lib/data/admin-mutations";
import { createServiceClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/validation";
import { enforce as enforceRateLimit } from "@/lib/rate-limit";
import { tags } from "@/lib/cache/tags";

import type { ActionResult } from "./_shared";

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

  // Rate limit — see lib/rate-limit.ts for sizing rationale. Without
  // this, any signed-in user could spam-create competition rows
  // (`competitions.name` has no uniqueness constraint).
  const rl = await enforceRateLimit("competitionsCreate", auth.userId);
  if (!rl.ok) return { error: rl.error };

  const result = await createCompetition(auth.supabase, {
    name,
    description: form.description?.trim() || null,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    organiserId: auth.userId,
  });
  if ("error" in result) return { error: result.error };

  revalidateTag(tags.competition(result.competitionId), "max");
  return { success: true, competitionId: result.competitionId };
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
  const gate = await requireCompetitionOrganiser(competitionId);
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

  revalidateTag(tags.competition(competitionId), "max");
  return { success: true };
}

// Linking/unlinking a gym is allowed for either the comp organiser
// OR an admin of that gym — see requireCompetitionOrganiserOrGymAdmin
// in src/lib/auth.ts for the full rationale (defence-in-depth on top
// of RLS).

export async function linkCompetitionGym(form: {
  competitionId: string;
  gymId: string;
}): Promise<ActionResult> {
  const gate = await requireCompetitionOrganiserOrGymAdmin(
    form.competitionId,
    form.gymId,
  );
  if ("error" in gate) return { error: gate.error };

  const result = await linkGymToCompetition(
    gate.supabase,
    form.competitionId,
    form.gymId,
  );
  if ("error" in result) return { error: result.error };

  revalidateTag(tags.competition(form.competitionId), "max");
  return { success: true };
}

export async function unlinkCompetitionGym(form: {
  competitionId: string;
  gymId: string;
}): Promise<ActionResult> {
  const gate = await requireCompetitionOrganiserOrGymAdmin(
    form.competitionId,
    form.gymId,
  );
  if ("error" in gate) return { error: gate.error };

  const result = await unlinkGymFromCompetition(
    gate.supabase,
    form.competitionId,
    form.gymId,
  );
  if ("error" in result) return { error: result.error };

  revalidateTag(tags.competition(form.competitionId), "max");
  return { success: true };
}

export async function addCompetitionCategory(form: {
  competitionId: string;
  name: string;
  displayOrder?: number;
}): Promise<ActionResult<{ categoryId: string }>> {
  const gate = await requireCompetitionOrganiser(form.competitionId);
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

  revalidateTag(tags.competition(form.competitionId), "max");
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

  const gate = await requireCompetitionOrganiser(cat.competition_id);
  if ("error" in gate) return { error: gate.error };

  const result = await deleteCompetitionCategory(gate.supabase, categoryId);
  if ("error" in result) return { error: result.error };

  revalidateTag(tags.competition(cat.competition_id), "max");
  return { success: true };
}
