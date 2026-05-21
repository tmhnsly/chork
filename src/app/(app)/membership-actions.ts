"use server";

import { revalidateTag } from "next/cache";
import { revalidateUserProfile } from "@/lib/cache/revalidate";
import { requireAuth, requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { UUID_RE } from "@/lib/validation";
import { tags } from "@/lib/cache/tags";
import type { ActionResult } from "@/lib/action-result";

// ────────────────────────────────────────────────────────────────
// Competitions — climber participation
// ────────────────────────────────────────────────────────────────

/**
 * Climber joins a competition, optionally self-selecting a category.
 * Upsert on the composite key keeps it idempotent and also lets the
 * same call update an already-joined climber's category.
 */
export async function joinCompetition(
  competitionId: string,
  categoryId: string | null = null
): Promise<ActionResult> {
  if (typeof competitionId !== "string" || !UUID_RE.test(competitionId)) {
    return { error: "Invalid competition" };
  }
  if (categoryId !== null && (typeof categoryId !== "string" || !UUID_RE.test(categoryId))) {
    return { error: "Invalid category" };
  }

  // requireAuth (not just signed-in) — joining a competition makes
  // the climber visible on gym-scoped leaderboards, so they must
  // have an active gym context and be a member of a gym that's
  // actually linked to this competition.
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId, gymId } = auth;

  try {
    // Gate: the caller's active gym must be linked to this
    // competition via `competition_gyms`. Without this check a
    // climber at one gym could join a competition they have no
    // business in by fiddling the URL — RLS alone only enforces
    // user_id=self on the participant row.
    const { data: gymLink } = await supabase
      .from("competition_gyms")
      .select("competition_id")
      .eq("competition_id", competitionId)
      .eq("gym_id", gymId)
      .maybeSingle();
    if (!gymLink) {
      return { error: "This competition isn't running at your gym." };
    }

    // If a category is supplied, confirm it belongs to the competition.
    if (categoryId) {
      const { data: cat } = await supabase
        .from("competition_categories")
        .select("competition_id")
        .eq("id", categoryId)
        .maybeSingle();
      if (!cat || cat.competition_id !== competitionId) {
        return { error: "Category does not belong to this competition" };
      }
    }

    const { error } = await supabase
      .from("competition_participants")
      .upsert(
        { competition_id: competitionId, user_id: userId, category_id: categoryId },
        { onConflict: "competition_id,user_id" }
      );
    if (error) return { error: formatError(error) };

    // Tag-bust the competition detail (matches CLAUDE.md rule:
    // mutations revalidate tags, not paths). The /competitions
    // listing page picks up the participation flip via its 60s RSC
    // stale-time — adding a dedicated `competitionsList` tag is the
    // follow-up if the listing freshness ever becomes user-visible.
    revalidateTag(tags.competition(competitionId), "max");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function leaveCompetition(
  competitionId: string
): Promise<ActionResult> {
  if (typeof competitionId !== "string" || !UUID_RE.test(competitionId)) {
    return { error: "Invalid competition" };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("competition_participants")
      .delete()
      .eq("competition_id", competitionId)
      .eq("user_id", userId);
    if (error) return { error: formatError(error) };

    // Same tag-bust pattern as joinCompetition above.
    revalidateTag(tags.competition(competitionId), "max");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ────────────────────────────────────────────────────────────────
// Gym switching — set the climber's active gym context
// ────────────────────────────────────────────────────────────────

/**
 * Switch the signed-in climber's active gym. If they aren't already a
 * member of the target gym, a `climber` membership is created first so
 * subsequent RLS checks against `is_gym_member` succeed. Previous
 * memberships are preserved — switching is purely about which gym
 * surfaces on the wall and Chorkboard.
 */
export async function switchActiveGym(
  gymId: string
): Promise<ActionResult<{ gymId: string }>> {
  if (typeof gymId !== "string" || !UUID_RE.test(gymId)) {
    return { error: "Invalid gym" };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Confirm the target is a real, listed gym (RLS already gates reads
    // — `is_listed=true` are visible to any authed user).
    const { data: gym, error: gymErr } = await supabase
      .from("gyms")
      .select("id")
      .eq("id", gymId)
      .eq("is_listed", true)
      .maybeSingle();
    if (gymErr || !gym) return { error: "Gym not found" };

    // Ensure membership exists — upsert keeps switching idempotent.
    const { error: memErr } = await supabase
      .from("gym_memberships")
      .upsert({ user_id: userId, gym_id: gymId }, { onConflict: "user_id,gym_id" });
    if (memErr) return { error: formatError(memErr) };

    const { error: profErr } = await supabase
      .from("profiles")
      .update({ active_gym_id: gymId })
      .eq("id", userId);
    if (profErr) return { error: formatError(profErr) };

    await revalidateUserProfile(supabase, userId);
    return { success: true, gymId };
  } catch (err) {
    return { error: formatError(err) };
  }
}
