"use server";

import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";
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
 * Drop the nav-shell cookie so middleware re-derives it from the
 * profile on the next request.
 *
 * `chork-auth-shell` tells `NavBarShell` which nav to paint on first
 * byte. Middleware only reads the profile to set it while the
 * `chork-onboarded` cookie is cold; once that goes warm — permanently,
 * after onboarding — it derives `hasGym` from the *existing* shell
 * cookie instead. That makes the value self-perpetuating: changing
 * your gym could never change it, because it only ever agreed with
 * itself.
 *
 * The visible symptom was the nav flashing on reload — the server
 * painted the stale shell, then the client hydrated from the real
 * profile and swapped the tabs underneath you.
 *
 * Deleting it here rather than adding a profile read to middleware:
 * middleware runs on every navigation and CLAUDE.md keeps Supabase
 * queries out of that path. This costs one read, once, only after the
 * gym actually changes. Same pattern `login/actions.ts` already uses
 * when a session starts.
 */
async function invalidateNavShell(): Promise<void> {
  const jar = await cookies();
  jar.delete("chork-auth-shell");
}

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

    // Ensure membership exists. `ignoreDuplicates` makes this
    // ON CONFLICT DO **NOTHING** rather than DO UPDATE — load-bearing,
    // not a micro-optimisation.
    //
    // `gym_memberships` has SELECT, INSERT and DELETE policies and no
    // UPDATE policy, by design: nothing about a membership is meant to
    // change once created. A DO UPDATE upsert needs both INSERT and
    // UPDATE permission, so the moment the row already existed RLS
    // denied the whole statement and the action bailed before ever
    // reaching the profile update.
    //
    // That made switching fail for any gym the climber had joined
    // before — which is every gym they'd previously switched to. The
    // first switch to a brand-new gym worked (a pure INSERT) and every
    // switch back silently didn't. There is nothing to update here
    // anyway: the row's existence *is* the membership.
    const { error: memErr } = await supabase
      .from("gym_memberships")
      .upsert(
        { user_id: userId, gym_id: gymId },
        { onConflict: "user_id,gym_id", ignoreDuplicates: true },
      );
    if (memErr) return { error: formatError(memErr) };

    const { error: profErr } = await supabase
      .from("profiles")
      .update({ active_gym_id: gymId })
      .eq("id", userId);
    if (profErr) return { error: formatError(profErr) };

    await invalidateNavShell();
    await revalidateUserProfile(supabase, userId);
    return { success: true, gymId };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Step out of gym mode — clears `profiles.active_gym_id` while leaving
 * every `gym_memberships` row in place.
 *
 * Gymless is a first-class state, not a degraded one: Chork's core is
 * running your own comps anywhere via jams, and the wall/board are the
 * extra layer for gyms that have adopted it. Onboarding already lets a
 * climber finish without a gym; this is the missing return path for
 * someone who moves away from a Chork gym and wants the wall and board
 * to stop following them around.
 *
 * The membership deliberately survives:
 *
 *   • `route_logs` SELECT is gated on `is_gym_member(gym_id)`, so
 *     dropping it would hide the climber's own history at that gym
 *     from their own profile — data intact, silently unreadable.
 *   • `switchActiveGym` already preserves previous memberships, so
 *     leaving behaves the same way as switching.
 *   • Re-picking the gym is then instant, with no re-join.
 *
 * They stay on that gym's all-time board (fair — they did climb
 * there) and drop off the current-set board on its own once the set
 * rolls over, since set boards only count logs in that set.
 */
export async function clearActiveGym(): Promise<ActionResult<{ gymId: null }>> {
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ active_gym_id: null })
      .eq("id", userId);
    if (error) return { error: formatError(error) };

    await invalidateNavShell();
    await revalidateUserProfile(supabase, userId);
    return { success: true, gymId: null };
  } catch (err) {
    return { error: formatError(err) };
  }
}
