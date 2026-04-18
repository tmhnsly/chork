"use server";

import { revalidateTag } from "next/cache";
import { requireSignedIn } from "@/lib/auth";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { sendPushInBackground } from "@/lib/push/server";
import { notifyUser } from "@/lib/notify";
import { revalidateUserProfile } from "@/lib/cache/revalidate";
import { UUID_RE } from "@/lib/validation";
import { enforce as enforceRateLimit } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { logger } from "@/lib/logger";
import { tags } from "@/lib/cache/tags";
type ActionResult<T = unknown> = { error: string } | ({ success: true } & T);

/**
 * Fan-out tag invalidation: bust crew:{id} + every active member's
 * user:{uid}:crews tag. Pass extra ids (e.g. just-removed leaver)
 * via `extraUserIds` since they no longer appear in crew_members.
 */
async function revalidateCrewMembers(
  supabase: SupabaseClient<Database>,
  crewId: string,
  extraUserIds: string[] = [],
) {
  revalidateTag(tags.crew(crewId));
  const { data: members } = await supabase
    .from("crew_members")
    .select("user_id")
    .eq("crew_id", crewId)
    .eq("status", "active");
  const seen = new Set<string>();
  if (Array.isArray(members)) {
    for (const m of members) {
      if (m.user_id && !seen.has(m.user_id)) {
        revalidateTag(tags.userCrews(m.user_id));
        seen.add(m.user_id);
      }
    }
  }
  for (const uid of extraUserIds) {
    if (!seen.has(uid)) {
      revalidateTag(tags.userCrews(uid));
      seen.add(uid);
    }
  }
}

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
  // `bump_invite_rate_limit` check below for two reasons:
  //   • faster fail under a burst — Redis short-circuits before we
  //     take a Postgres connection slot.
  //   • defence-in-depth — if the SQL RPC ever drifts (grant
  //     tightening, schema rename), the app-layer cap still holds.
  const rl = await enforceRateLimit("invitesSend", userId);
  if (!rl.ok) return { error: rl.error };

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
      await notifyUser(targetUserId, {
        kind: "crew_invite_received",
        payload: {
          crew_id: crewId,
          crew_name: crewRow?.name ?? "a crew",
          invite_id: inserted?.id ?? "",
          inviter_username: inviterRow?.username ?? "someone",
        },
      });
      sendPushInBackground(
        [targetUserId],
        {
          title: "New crew invite",
          body: `@${inviterRow?.username ?? "someone"} invited you to ${crewRow?.name ?? "a crew"}.`,
          url: "/crew",
        },
        { category: "invite_received" },
      );
    } catch (err) {
      logger.warn("crew_invite_dispatch_failed", { err: formatErrorForLog(err) });
    }

    revalidateTag(tags.crew(crewId));
    revalidateTag(tags.userCrews(userId));
    revalidateTag(tags.userNotifications(targetUserId));
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
    // Flip status first, returning the updated row — the conditional
    // `.eq("status", "pending")` means the row comes back only if
    // the invite was still pending at the exact moment of the update.
    // If someone cancelled the invite (or it was never ours), the
    // returning row is empty and we exit without firing phantom
    // notifications. Previously we read, then wrote, leaving a TOCTOU
    // window where a cancel landed in between and we'd still push
    // "accepted" to the inviter.
    const { data: invite, error } = await supabase
      .from("crew_members")
      .update({ status: "active" })
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("invited_by, crew_id, crew:crew_id (name)")
      .maybeSingle();
    if (error) return { error: formatError(error) };
    if (!invite) return { error: "Invite not found." };

    // Best-effort push to the inviter so they see the confirmation
    // without needing to reopen the app. sendPushInBackground defers
    // the dispatch via after() so the action returns as soon as the
    // notify_user log row is written; push latency stays off the
    // user-visible response.
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
        await notifyUser(invite.invited_by, {
          kind: "crew_invite_accepted",
          payload: {
            crew_id: invite.crew_id,
            crew_name: crewName ?? "a crew",
            accepter_username: accepterRow?.username ?? "someone",
          },
        });
        sendPushInBackground(
          [invite.invited_by],
          {
            title: "Invite accepted",
            body: `@${accepterRow?.username ?? "someone"} joined ${crewName ?? "your crew"}.`,
            url: "/crew",
          },
          { category: "invite_accepted" },
        );
      } catch (err) {
        logger.warn("crew_accept_push_dispatch_failed", { err: formatErrorForLog(err) });
      }
    }

    if (invite?.crew_id) {
      // crew_id from the prior fetch + accepter is now active in the
      // members list, so the fan-out catches them too.
      await revalidateCrewMembers(supabase, invite.crew_id);
      if (invite.invited_by && invite.invited_by !== userId) {
        revalidateTag(tags.userNotifications(invite.invited_by));
      }
    }
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
    // Capture invite metadata before delete so we know who to notify +
    // which crew tag to bust.
    const { data: invite } = await supabase
      .from("crew_members")
      .select("invited_by, crew_id")
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    const { error } = await supabase
      .from("crew_members")
      .delete()
      .eq("id", crewMemberId)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) return { error: formatError(error) };

    if (invite?.crew_id) {
      revalidateTag(tags.crew(invite.crew_id));
      revalidateTag(tags.userCrews(userId));
      if (invite.invited_by && invite.invited_by !== userId) {
        revalidateTag(tags.userNotifications(invite.invited_by));
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

    // Read-then-write ordering (rather than delete-self-then-recount +
    // rollback-insert) because the INSERT policy on crew_members
    // forbids both self-insert and `status=active` — a rollback would
    // RLS-fail silently and strand the creator outside their own crew
    // with no path back in. The window between count and delete is
    // sub-millisecond; concurrent joins against a crew being
    // dismantled are covered by FK cascades in the solo-creator
    // tear-down branch.
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
      revalidateTag(tags.crew(crewId));
      revalidateTag(tags.userCrews(userId));
      return { success: true };
    }

    const { error } = await supabase
      .from("crew_members")
      .delete()
      .eq("crew_id", crewId)
      .eq("user_id", userId);
    if (error) return { error: formatError(error) };

    // Leaver no longer in crew_members; pass them via extraUserIds so
    // their crews tag busts alongside the remaining active set.
    await revalidateCrewMembers(supabase, crewId, [userId]);
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
      await notifyUser(newOwnerId, {
        kind: "crew_ownership_transferred",
        payload: {
          crew_id: crewId,
          crew_name: crewName?.name ?? "a crew",
          from_username: fromRow?.username ?? "someone",
        },
      });
      sendPushInBackground(
        [newOwnerId],
        {
          title: "You're now the crew creator",
          body: `@${fromRow?.username ?? "someone"} handed ${crewName?.name ?? "a crew"} over to you.`,
          url: `/crew/${crewId}`,
        },
        { category: "ownership_changed" },
      );
    } catch (err) {
      logger.warn("crew_transfer_push_dispatch_failed", { err: formatErrorForLog(err) });
    }

    await revalidateCrewMembers(supabase, crewId);
    revalidateTag(tags.userNotifications(newOwnerId));
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

    // allow_crew_invites is a profile column; bust both uid + by-username
    // tags so getProfileByUsername's cache entry actually invalidates.
    await revalidateUserProfile(supabase, userId);
    return { success: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
