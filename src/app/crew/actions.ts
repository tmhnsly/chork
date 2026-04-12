"use server";

import { revalidatePath } from "next/cache";
import { requireSignedIn } from "@/lib/auth";
import { formatError } from "@/lib/errors";
import { sendPushToUsers } from "@/lib/push/server";

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
    const { data, error } = await supabase
      .from("crews")
      .insert({ name: trimmed, created_by: userId })
      .select("id")
      .single();
    if (error || !data) return { error: formatError(error) };

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
    const [{ data: target }, { data: blocked }] = await Promise.all([
      supabase
        .from("profiles")
        .select("allow_crew_invites")
        .eq("id", targetUserId)
        .maybeSingle(),
      supabase
        .from("blocked_users")
        .select("id")
        .or(
          `and(blocker_id.eq.${userId},blocked_id.eq.${targetUserId}),` +
          `and(blocker_id.eq.${targetUserId},blocked_id.eq.${userId})`
        )
        .limit(1),
    ]);
    if (!target) return { error: "User not found." };
    if (!target.allow_crew_invites) return { error: "That climber isn't taking invites." };
    if (blocked && blocked.length > 0) return { error: "You can't invite that climber." };

    const { error } = await supabase
      .from("crew_members")
      .insert({
        crew_id: crewId,
        user_id: targetUserId,
        invited_by: userId,
        status: "pending",
      });

    if (error) {
      // Unique violation = already a member or pending. Surface a
      // meaningful message rather than a raw DB error.
      if (error.code === "23505") {
        return { error: "This climber already has an invite for that crew." };
      }
      return { error: formatError(error) };
    }

    // Fire a push notification to the invitee. Best-effort — push
    // failures never propagate to the user because the invite row is
    // already written. `sendPushToUsers` is a noop when VAPID isn't
    // configured, so this stays safe in dev without extra guards.
    try {
      const [{ data: crewRow }, { data: inviterRow }] = await Promise.all([
        supabase.from("crews").select("name").eq("id", crewId).maybeSingle(),
        supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
      ]);
      await sendPushToUsers([targetUserId], {
        title: "New crew invite",
        body: `@${inviterRow?.username ?? "someone"} invited you to ${crewRow?.name ?? "a crew"}.`,
        url: "/crew",
      });
    } catch (err) {
      console.warn("[chork] crew-invite push dispatch failed:", err);
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
    const { error } = await supabase
      .from("crew_members")
      .update({ status: "active" })
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) return { error: formatError(error) };

    revalidatePath("/crew", "layout");
    revalidatePath("/", "layout");
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

/** Leave an active crew. Safe to call from a pending state too. */
export async function leaveCrew(crewId: string): Promise<ActionResult> {
  if (!UUID_RE.test(crewId)) return { error: "Invalid crew." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("crew_members")
      .delete()
      .eq("crew_id", crewId)
      .eq("user_id", userId);
    if (error) return { error: formatError(error) };

    revalidatePath("/crew", "layout");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ────────────────────────────────────────────────────────────────
// Blocks
// ────────────────────────────────────────────────────────────────

export async function blockUser(targetUserId: string): Promise<ActionResult> {
  if (!UUID_RE.test(targetUserId)) return { error: "Invalid user." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  if (userId === targetUserId) {
    return { error: "You can't block yourself." };
  }

  try {
    const { error } = await supabase
      .from("blocked_users")
      .upsert(
        { blocker_id: userId, blocked_id: targetUserId },
        { onConflict: "blocker_id,blocked_id" }
      );
    if (error) return { error: formatError(error) };

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function unblockUser(targetUserId: string): Promise<ActionResult> {
  if (!UUID_RE.test(targetUserId)) return { error: "Invalid user." };

  const auth = await requireSignedIn();
  if ("error" in auth) return { error: auth.error };
  const { supabase, userId } = auth;

  try {
    const { error } = await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", userId)
      .eq("blocked_id", targetUserId);
    if (error) return { error: formatError(error) };

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

// ────────────────────────────────────────────────────────────────
// Privacy toggle — allow_crew_invites
// ────────────────────────────────────────────────────────────────

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

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
