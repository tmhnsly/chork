import "server-only";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify";
import { tags } from "@/lib/cache/tags";

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

async function revalidateCrewMembers(supabase: Supabase, crewId: string) {
  revalidateTag(tags.crew(crewId), "max");
  const { data: members } = await supabase
    .from("crew_members")
    .select("user_id")
    .eq("crew_id", crewId)
    .eq("status", "active");
  if (Array.isArray(members)) {
    for (const m of members) {
      if (m.user_id) revalidateTag(tags.userCrews(m.user_id), "max");
    }
  }
}
