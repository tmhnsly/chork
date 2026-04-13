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

    revalidatePath("/crew", "layout");
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
