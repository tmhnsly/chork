"use server";

import { revalidateTag } from "next/cache";
import {
  gateSignedInMutation,
  requireCompetitionOrganiser,
  requireCompetitionOrganiserOrGymAdmin,
} from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { formatError } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";
import { tags } from "@/lib/cache/tags";
import type { Database } from "@/lib/database.types";

import type { ActionResult } from "@/lib/action-result";

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

  // Payload-validated above, so no resource id. The bucket is the
  // dedicated one — see lib/rate-limit.ts for sizing: without it any
  // signed-in user could spam-create competition rows
  // (`competitions.name` has no uniqueness constraint).
  const auth = await gateSignedInMutation(null, "competition", {
    rateLimit: "competitionsCreate",
  });
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("competitions")
    .insert({
      name,
      description: form.description?.trim() || null,
      starts_at: form.startsAt,
      ends_at: form.endsAt,
      status: "draft",
      organiser_id: auth.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: formatError(error) };

  revalidateTag(tags.competition(data.id), "max");
  return { success: true, competitionId: data.id };
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
  const gate = await requireCompetitionOrganiser(competitionId, {
    rateLimit: "mutationsWrite",
  });
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

  type CompetitionUpdate = Database["public"]["Tables"]["competitions"]["Update"];
  const patch: CompetitionUpdate = {};
  if (form.name !== undefined) patch.name = form.name;
  if (form.description !== undefined) patch.description = form.description;
  if (form.startsAt !== undefined) patch.starts_at = form.startsAt;
  if (form.endsAt !== undefined) patch.ends_at = form.endsAt;
  if (form.status !== undefined) patch.status = form.status;

  const { error } = await gate.supabase
    .from("competitions")
    .update(patch)
    .eq("id", competitionId);
  if (error) return { error: formatError(error) };

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
    { rateLimit: "mutationsWrite" },
  );
  if ("error" in gate) return { error: gate.error };

  const { error } = await gate.supabase
    .from("competition_gyms")
    .upsert(
      { competition_id: form.competitionId, gym_id: form.gymId },
      { onConflict: "competition_id,gym_id" },
    );
  if (error) return { error: formatError(error) };

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
    { rateLimit: "mutationsWrite" },
  );
  if ("error" in gate) return { error: gate.error };

  const { error } = await gate.supabase
    .from("competition_gyms")
    .delete()
    .eq("competition_id", form.competitionId)
    .eq("gym_id", form.gymId);
  if (error) return { error: formatError(error) };

  revalidateTag(tags.competition(form.competitionId), "max");
  return { success: true };
}

export async function addCompetitionCategory(form: {
  competitionId: string;
  name: string;
  displayOrder?: number;
}): Promise<ActionResult<{ categoryId: string }>> {
  const gate = await requireCompetitionOrganiser(form.competitionId, {
    rateLimit: "mutationsWrite",
  });
  if ("error" in gate) return { error: gate.error };

  const name = (form.name ?? "").trim();
  if (name.length < 1 || name.length > 60) return { error: "Name must be 1–60 characters." };

  const { data, error } = await gate.supabase
    .from("competition_categories")
    .insert({
      competition_id: form.competitionId,
      name,
      display_order: form.displayOrder ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) return { error: formatError(error) };

  revalidateTag(tags.competition(form.competitionId), "max");
  return { success: true, categoryId: data.id };
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

  const gate = await requireCompetitionOrganiser(cat.competition_id, {
    rateLimit: "mutationsWrite",
  });
  if ("error" in gate) return { error: gate.error };

  const { error } = await gate.supabase
    .from("competition_categories")
    .delete()
    .eq("id", categoryId);
  if (error) return { error: formatError(error) };

  revalidateTag(tags.competition(cat.competition_id), "max");
  return { success: true };
}
