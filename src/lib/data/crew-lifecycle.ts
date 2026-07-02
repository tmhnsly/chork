import "server-only";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify";
import { tags } from "@/lib/cache/tags";
import { revalidateCrewMembers } from "@/lib/cache/revalidate";
import { one } from "./read";

type Supabase = SupabaseClient<Database>;
type LifecycleResult = { ok: true } | { error: string };

/**
 * Crew lifecycle orchestration. Each function owns the multi-step
 * transaction for one domain operation: pre-flight reads, mutation,
 * notification dispatch, cache busting. Server actions stay as thin
 * shells around boundary concerns (input validation, auth, rate
 * limits) and delegate the actual work here.
 *
 * See CONTEXT.md "Notification" — these orchestrations all emit one
 * notification per recipient via `notify()`.
 */

interface SendInviteArgs {
  supabase: Supabase;
  actorId: string;
  crewId: string;
  targetUserId: string;
}

/**
 * Execute the "send a crew invite" transaction.
 *
 * Steps: SQL rate-limit (bump_invite_rate_limit) → block + opt-out
 * check on the target → insert pending crew_members row → dispatch
 * notification → bust crew + actor's userCrews tags. Caller is
 * responsible for input validation, auth, the self-invite check,
 * and any edge-layer rate-limit before reaching this function.
 */
export async function sendCrewInvite(
  args: SendInviteArgs,
): Promise<LifecycleResult> {
  const { supabase, actorId, crewId, targetUserId } = args;
  try {
    const { data: under } = await supabase.rpc("bump_invite_rate_limit");
    if (under === false) {
      return { error: "You've hit today's invite limit. Try again tomorrow." };
    }

    const { data: target } = await supabase
      .from("profiles")
      .select("allow_crew_invites")
      .eq("id", targetUserId)
      .maybeSingle();
    if (!target) return { error: "User not found." };
    if (!target.allow_crew_invites) {
      return { error: "That climber isn't taking invites." };
    }

    const { data: inserted, error } = await supabase
      .from("crew_members")
      .insert({
        crew_id: crewId,
        user_id: targetUserId,
        invited_by: actorId,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return { error: "This climber already has an invite for that crew." };
      }
      return { error: formatError(error) };
    }

    try {
      const [{ data: crewRow }, { data: inviterRow }] = await Promise.all([
        supabase.from("crews").select("name").eq("id", crewId).maybeSingle(),
        supabase.from("profiles").select("username").eq("id", actorId).maybeSingle(),
      ]);
      await notify({
        kind: "crew_invite_received",
        recipient: targetUserId,
        actor: actorId,
        crewId,
        crewName: crewRow?.name ?? "a crew",
        inviteId: inserted?.id ?? "",
        inviterUsername: inviterRow?.username ?? "someone",
      });
    } catch (err) {
      logger.warn("crew_invite_dispatch_failed", { err: formatErrorForLog(err) });
    }

    revalidateTag(tags.crew(crewId), "max");
    revalidateTag(tags.userCrews(actorId), "max");
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

interface AcceptInviteArgs {
  supabase: Supabase;
  actorId: string;
  crewMemberId: string;
}

/**
 * Execute the "accept a crew invite" transaction.
 *
 * Steps: conditional status flip (pending → active) returning the
 * updated row → notify the inviter → bust crew member tags. The
 * `.eq("status", "pending")` predicate on the UPDATE means the row
 * comes back only if the invite was still pending at the exact moment
 * of the write — if someone cancelled the invite (or it was never
 * ours), the returning row is empty and we exit without firing
 * phantom notifications. A previous read-then-write flow left a
 * TOCTOU window where a cancel landed in between and we'd still push
 * "accepted" to the inviter. Caller is responsible for input
 * validation + auth before reaching this function.
 */
export async function acceptCrewInvite(
  args: AcceptInviteArgs,
): Promise<LifecycleResult> {
  const { supabase, actorId, crewMemberId } = args;
  try {
    const { data: invite, error } = await supabase
      .from("crew_members")
      .update({ status: "active" })
      .eq("id", crewMemberId)
      .eq("user_id", actorId)
      .eq("status", "pending")
      .select("invited_by, crew_id, crew:crew_id (name)")
      .maybeSingle();
    if (error) return { error: formatError(error) };
    if (!invite) return { error: "Invite not found." };

    if (invite.invited_by && invite.invited_by !== actorId) {
      try {
        const { data: accepterRow } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", actorId)
          .maybeSingle();
        await notify({
          kind: "crew_invite_accepted",
          recipient: invite.invited_by,
          actor: actorId,
          crewId: invite.crew_id,
          crewName: one(invite.crew)?.name ?? "a crew",
          accepterUsername: accepterRow?.username ?? "someone",
        });
      } catch (err) {
        logger.warn("crew_accept_push_dispatch_failed", { err: formatErrorForLog(err) });
      }
    }

    if (invite.crew_id) {
      await revalidateCrewMembers(supabase, invite.crew_id);
    }
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

interface TransferOwnershipArgs {
  supabase: Supabase;
  actorId: string;
  crewId: string;
  newOwnerId: string;
}

/**
 * Execute the "hand crew ownership to another active member" transaction.
 *
 * Steps: verify caller is current creator → verify target is an active
 * member → UPDATE crews.created_by → dispatch notification → bust crew
 * member tags. Caller validates input + auth + the self-transfer check
 * before reaching this function.
 */
export async function transferCrewOwnership(
  args: TransferOwnershipArgs,
): Promise<LifecycleResult> {
  const { supabase, actorId, crewId, newOwnerId } = args;
  try {
    const { data: crew } = await supabase
      .from("crews")
      .select("created_by")
      .eq("id", crewId)
      .maybeSingle();
    if (!crew) return { error: "Crew not found." };
    if (crew.created_by !== actorId) {
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

    try {
      const { data: fromRow } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", actorId)
        .maybeSingle();
      const { data: crewName } = await supabase
        .from("crews")
        .select("name")
        .eq("id", crewId)
        .maybeSingle();
      await notify({
        kind: "crew_ownership_transferred",
        recipient: newOwnerId,
        actor: actorId,
        crewId,
        crewName: crewName?.name ?? "a crew",
        fromUsername: fromRow?.username ?? "someone",
      });
    } catch (err) {
      logger.warn("crew_transfer_push_dispatch_failed", { err: formatErrorForLog(err) });
    }

    await revalidateCrewMembers(supabase, crewId);
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}
