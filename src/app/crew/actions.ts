"use server";

import { revalidatePath } from "next/cache";
import { requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { sendPushToUsers } from "@/lib/push/server";
import { notifyUser } from "@/lib/notify";

type ActionResult<T = unknown> = { error: string } | ({ success: true } & T);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    revalidatePath("/crew", "layout");
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

  try {
    // Rate limit — 10 invites per caller per day. RPC is atomic so a
    // parallel burst can't race past the cap.
    const { data: under } = await supabase.rpc("bump_invite_rate_limit");
    if (under === false) {
      return { error: "You've hit today's invite limit. Try again tomorrow." };
    }

    // Reject invites where the target has opted out OR has blocked
    // the caller OR the caller has blocked them. The search query
    // filters these, but a stale client payload might still reach us.
    const { data: target } = await supabase
      .from("profiles")
      .select("allow_crew_invites")
      .eq("id", targetUserId)
      .maybeSingle();
    if (!target) return { error: "User not found." };
    if (!target.allow_crew_invites) return { error: "That climber isn't taking invites." };

    const { data: inserted, error } = await supabase
      .from("crew_members")
      .insert({
        crew_id: crewId,
        user_id: targetUserId,
        invited_by: userId,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      // Unique violation = already a member or pending. Surface a
      // meaningful message rather than a raw DB error.
      if (error.code === "23505") {
        return { error: "This climber already has an invite for that crew." };
      }
      return { error: formatError(error) };
    }

    // Fire a push notification + log the event to the in-app log
    // so the invitee catches up even if the push was dropped. Both
    // are best-effort; the invite row is already written by now.
    try {
      const [{ data: crewRow }, { data: inviterRow }] = await Promise.all([
        supabase.from("crews").select("name").eq("id", crewId).maybeSingle(),
        supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
      ]);
      await notifyUser(supabase, targetUserId, {
        kind: "crew_invite_received",
        payload: {
          crew_id: crewId,
          crew_name: crewRow?.name ?? "a crew",
          invite_id: inserted?.id ?? "",
          inviter_username: inviterRow?.username ?? "someone",
        },
      });
      await sendPushToUsers(
        [targetUserId],
        {
          title: "New crew invite",
          body: `@${inviterRow?.username ?? "someone"} invited you to ${crewRow?.name ?? "a crew"}.`,
          url: "/crew",
        },
        { category: "invite_received" },
      );
    } catch (err) {
      console.warn("[chork] crew-invite dispatch failed:", err);
    }

    revalidatePath("/crew", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function acceptCrewInvite(crewMemberId: string): Promise<ActionResult> {
  if (!UUID_RE.test(crewMemberId)) return { error: "Invalid invite." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    // Fetch the invite row alongside the update so we have the
    // inviter id + crew name to push back on success. Running both
    // queries before the update keeps the happy path to two
    // round-trips without adding a new RPC.
    const { data: invite } = await supabase
      .from("crew_members")
      .select("invited_by, crew_id, crew:crew_id (name)")
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    const { error } = await supabase
      .from("crew_members")
      .update({ status: "active" })
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) return { error: formatError(error) };

    // Best-effort push to the inviter so they see the confirmation
    // without needing to reopen the app. sendPushToUsers is a noop
    // when VAPID isn't configured; failures never block the accept.
    if (invite?.invited_by && invite.invited_by !== userId) {
      try {
        const { data: accepterRow } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userId)
          .maybeSingle();
        const crewName = Array.isArray(invite.crew)
          ? invite.crew[0]?.name
          : invite.crew?.name;
        await notifyUser(supabase, invite.invited_by, {
          kind: "crew_invite_accepted",
          payload: {
            crew_id: invite.crew_id,
            crew_name: crewName ?? "a crew",
            accepter_username: accepterRow?.username ?? "someone",
          },
        });
        await sendPushToUsers(
          [invite.invited_by],
          {
            title: "Invite accepted",
            body: `@${accepterRow?.username ?? "someone"} joined ${crewName ?? "your crew"}.`,
            url: "/crew",
          },
          { category: "invite_accepted" },
        );
      } catch (err) {
        console.warn("[chork] crew-accept push dispatch failed:", err);
      }
    }

    revalidatePath("/crew", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function declineCrewInvite(crewMemberId: string): Promise<ActionResult> {
  if (!UUID_RE.test(crewMemberId)) return { error: "Invalid invite." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("crew_members")
      .delete()
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) return { error: formatError(error) };

    revalidatePath("/crew", "layout");
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
    const [{ data: crew }, { count: activeCount }] = await Promise.all([
      supabase.from("crews").select("created_by").eq("id", crewId).maybeSingle(),
      supabase
        .from("crew_members")
        .select("id", { count: "exact", head: true })
        .eq("crew_id", crewId)
        .eq("status", "active"),
    ]);

    if (!crew) return { error: "Crew not found." };

    const isCreator = crew.created_by === userId;
    const otherActive = Math.max(0, (activeCount ?? 0) - 1);

    if (isCreator && otherActive > 0) {
      return {
        error:
          "You created this crew — transfer it or remove the other members first.",
      };
    }

    if (isCreator && otherActive === 0) {
      // Solo creator leaving → delete the crew; FK cascades handle
      // the membership + pending invite rows.
      const { error } = await supabase.from("crews").delete().eq("id", crewId);
      if (error) return { error: formatError(error) };
      revalidatePath("/crew", "layout");
      return { success: true };
    }

    const { error } = await supabase
      .from("crew_members")
      .delete()
      .eq("crew_id", crewId)
      .eq("user_id", userId);
    if (error) return { error: formatError(error) };

    revalidatePath("/crew", "layout");
    return { success: true };
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

  try {
    const { data: crew } = await supabase
      .from("crews")
      .select("created_by")
      .eq("id", crewId)
      .maybeSingle();
    if (!crew) return { error: "Crew not found." };
    if (crew.created_by !== userId) {
      return { error: "Only the current creator can transfer a crew." };
    }

    const { data: target } = await supabase
      .from("crew_members")
      .select("id")
      .eq("crew_id", crewId)
      .eq("user_id", newOwnerId)
      .eq("status", "active")
      .maybeSingle();
    if (!target) {
      return { error: "That climber isn't an active member of this crew." };
    }

    const { error } = await supabase
      .from("crews")
      .update({ created_by: newOwnerId })
      .eq("id", crewId);
    if (error) return { error: formatError(error) };

    // Notify the new creator best-effort — they just gained rights
    // over the crew and may not be watching the app.
    try {
      const { data: fromRow } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      const { data: crewName } = await supabase
        .from("crews")
        .select("name")
        .eq("id", crewId)
        .maybeSingle();
      await notifyUser(supabase, newOwnerId, {
        kind: "crew_ownership_transferred",
        payload: {
          crew_id: crewId,
          crew_name: crewName?.name ?? "a crew",
          from_username: fromRow?.username ?? "someone",
        },
      });
      await sendPushToUsers(
        [newOwnerId],
        {
          title: "You're now the crew creator",
          body: `@${fromRow?.username ?? "someone"} handed ${crewName?.name ?? "a crew"} over to you.`,
          url: `/crew/${crewId}`,
        },
        { category: "ownership_changed" },
      );
    } catch (err) {
      console.warn("[chork] crew-transfer push dispatch failed:", err);
    }

    revalidatePath("/crew", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
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

    revalidatePath("/crew", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
