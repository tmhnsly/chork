"use server";

import { revalidateTag } from "next/cache";
import { requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import {
  acceptCrewInvite as acceptCrewInviteLifecycle,
  sendCrewInvite as sendCrewInviteLifecycle,
  transferCrewOwnership as transferCrewOwnershipLifecycle,
} from "@/lib/data/crew-lifecycle";
import {
  revalidateCrewMembers,
  revalidateUserProfile,
} from "@/lib/cache/revalidate";
import { UUID_RE } from "@/lib/validation";
import { enforce as enforceRateLimit } from "@/lib/rate-limit";

import { tags } from "@/lib/cache/tags";
import type { ActionResult } from "@/lib/action-result";

// ────────────────────────────────────────────────────────────────
// Create / manage crews
// ────────────────────────────────────────────────────────────────

export async function createCrew(name: string): Promise<ActionResult<{ crewId: string }>> {
  const trimmed = (name ?? "").trim();
  if (trimmed.length < 1 || trimmed.length > 60) {
    return { error: "Crew name must be 1–60 characters." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Guard: the crews INSERT policy requires `created_by` matches
    // `auth.uid()` AND `created_by` FK-resolves to a profile row.
    // Users who bypassed onboarding (no profile yet) would otherwise
    // hit a bare "row-level security policy" error. Explicit check
    // here gives them a message they can act on.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) {
      return { error: "Finish onboarding before creating a crew." };
    }

    const { data, error } = await supabase
      .from("crews")
      .insert({ name: trimmed, created_by: userId })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.code === "42501") {
        // RLS violation. Most likely the session JWT has drifted
        // (long-lived tab + background sign-out). Ask the user to
        // refresh; the middleware will restore the cookie and the
        // next attempt should pass the policy check.
        return { error: "Session expired — refresh the page and try again." };
      }
      return { error: formatError(error) };
    }

    // The seat_crew_creator trigger has already inserted our active
    // membership row in the same transaction — no follow-up writes.
    await revalidateCrewMembers(supabase, data.id);
    return { success: true, crewId: data.id };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Send a crew invite. Verifies the caller's membership + rate limit in
 * SQL (RLS policy + bump_invite_rate_limit()) before inserting the
 * pending crew_members row.
 */
export async function inviteToCrew(
  crewId: string,
  targetUserId: string
): Promise<ActionResult> {
  if (!UUID_RE.test(crewId) || !UUID_RE.test(targetUserId)) {
    return { error: "Invalid request." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  if (userId === targetUserId) {
    return { error: "You can't invite yourself." };
  }

  // Edge-layer rate limit (Upstash). Runs BEFORE the SQL
  // `bump_invite_rate_limit` check inside the lifecycle for two
  // reasons:
  //   • faster fail under a burst — Redis short-circuits before we
  //     take a Postgres connection slot.
  //   • defence-in-depth — if the SQL RPC ever drifts (grant
  //     tightening, schema rename), the app-layer cap still holds.
  const rl = await enforceRateLimit("invitesSend", userId);
  if (!rl.ok) return { error: rl.error };

  const result = await sendCrewInviteLifecycle({
    supabase,
    actorId: userId,
    crewId,
    targetUserId,
  });
  if ("error" in result) return { error: result.error };
  return { success: true };
}

export async function acceptCrewInvite(crewMemberId: string): Promise<ActionResult> {
  if (!UUID_RE.test(crewMemberId)) return { error: "Invalid invite." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  const result = await acceptCrewInviteLifecycle({
    supabase,
    actorId: userId,
    crewMemberId,
  });
  if ("error" in result) return { error: result.error };
  return { success: true };
}

export async function declineCrewInvite(crewMemberId: string): Promise<ActionResult> {
  if (!UUID_RE.test(crewMemberId)) return { error: "Invalid invite." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Capture invite metadata before delete so we know who to notify +
    // which crew tag to bust.
    const { data: invite } = await supabase
      .from("crew_members")
      .select("invited_by, crew_id")
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    // `.select("id")` so we know whether the delete actually removed
    // a row. If another tab / device accepted (or declined) the
    // invite between our read above and this delete, the status has
    // already flipped — the predicate excludes the row, the delete
    // is a no-op, and we don't want to fire spurious cache busts
    // (which would invalidate the inviter's notifications tag for no
    // user-visible reason).
    const { data: deleted, error } = await supabase
      .from("crew_members")
      .delete()
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id");
    if (error) return { error: formatError(error) };

    if (invite?.crew_id && deleted && deleted.length > 0) {
      // Shared crew + userCrews pair via the fan-out helper. The
      // decliner never appears in the active roster, so pass them via
      // extraUserIds to bust their pending-invite banner.
      await revalidateCrewMembers(supabase, invite.crew_id, [userId]);
      // The inviter's notification state is outside the crew fan-out —
      // keep that extra tag inline at this call site.
      if (invite.invited_by && invite.invited_by !== userId) {
        revalidateTag(tags.userNotifications(invite.invited_by), "max");
      }
    }
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/**
 * Leave an active crew. Safe to call from a pending state too.
 *
 * Edge cases enforced server-side (the UI mirrors these but never
 * trusts the client):
 *   • Creator is the last active member → the crew is deleted
 *     entirely. `on delete cascade` on crew_members / pending
 *     invites tidies the rest.
 *   • Creator trying to leave with members present → refused.
 *     They must transfer ownership first (`transferCrewOwnership`);
 *     letting creators walk away would leave the crew orphaned.
 *   • Everyone else → plain leave.
 */
export async function leaveCrew(crewId: string): Promise<ActionResult> {
  if (!UUID_RE.test(crewId)) return { error: "Invalid crew." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Atomic count + branch + delete via `leave_crew_atomic` RPC
    // (migration 057). The previous read-then-write flow had a TOCTOU
    // window where a concurrent join could land between the count and
    // the crew delete, leading to "you joined and were instantly
    // removed for no visible reason." The RPC locks the crews row
    // for the duration so concurrent joins serialise correctly.
    const { data: outcome, error: rpcError } = await supabase.rpc(
      "leave_crew_atomic",
      { p_crew_id: crewId },
    );
    if (rpcError) return { error: formatError(rpcError) };

    switch (outcome) {
      case "not_found":
        return { error: "Crew not found." };
      case "not_member":
        return { error: "You're not a member of this crew." };
      case "creator_blocked":
        return {
          error:
            "You created this crew — transfer it or remove the other members first.",
        };
      case "crew_deleted":
        // Crew row is already gone, so the helper's member fetch finds
        // no rows — this resolves to the same crew + leaver userCrews
        // pair as before, through the one shared code path.
        await revalidateCrewMembers(supabase, crewId, [userId]);
        return { success: true };
      case "left":
        // Leaver no longer in crew_members; pass them via extraUserIds so
        // their crews tag busts alongside the remaining active set.
        await revalidateCrewMembers(supabase, crewId, [userId]);
        return { success: true };
      default:
        return { error: "Unexpected response from leave-crew." };
    }
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ────────────────────────────────────────────────────────────────
// Privacy toggle — allow_crew_invites
// ────────────────────────────────────────────────────────────────

/**
 * Transfer crew ownership from the current creator to another
 * active member of the same crew. Guarded by migration 031's
 * UPDATE policy — server enforces the "same crew active member"
 * rule too in case the policy is ever relaxed.
 */
export async function transferCrewOwnership(
  crewId: string,
  newOwnerId: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(crewId) || !UUID_RE.test(newOwnerId)) {
    return { error: "Invalid request." };
  }

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  if (newOwnerId === userId) {
    return { error: "You're already the creator." };
  }

  const result = await transferCrewOwnershipLifecycle({
    supabase,
    actorId: userId,
    crewId,
    newOwnerId,
  });
  if ("error" in result) return { error: result.error };
  return { success: true };
}

export async function setAllowCrewInvites(allow: boolean): Promise<ActionResult> {
  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("profiles")
      .update({ allow_crew_invites: allow })
      .eq("id", userId);
    if (error) return { error: formatError(error) };

    // allow_crew_invites is a profile column; bust both uid + by-username
    // tags so getProfileByUsername's cache entry actually invalidates.
    await revalidateUserProfile(supabase, userId);
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
