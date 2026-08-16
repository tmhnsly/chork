"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { gateSignedInMutation } from "@/lib/auth";
import { formatError, formatErrorForLog } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify";
import type { ActionResult } from "@/lib/action-result";

/**
 * Friend graph mutations.
 *
 * Every one is a thin wrapper over a SECURITY DEFINER RPC, because
 * `public.friends` has no Data API grant — see migration 104. The RPC
 * owns the state machine (idempotent asks, mutual-ask-means-accept,
 * who may revive a declined link); these functions own validation,
 * rate limiting and telling the other person.
 *
 * `revalidatePath("/friends")` rather than a cache tag: nothing here is
 * wrapped in `cachedQuery`, so there is no tag to bust, and the
 * reader-first rule in CLAUDE.md forbids inventing one ahead of a
 * reader.
 */

/**
 * The actor's handle, for the notification copy.
 *
 * Read here rather than passed in: an action must never trust the
 * client for the name it puts in someone else's notification.
 */
async function actorUsername(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return data?.username ?? "someone";
}

/** The RPC returns the row; only the outcome matters to the caller. */
interface FriendRow {
  id: string;
  status: "pending" | "active" | "declined";
  requester_id: string;
  addressee_id: string;
}

export async function requestFriend(
  targetUserId: string,
): Promise<ActionResult<{ status: FriendRow["status"] }>> {
  const auth = await gateSignedInMutation(targetUserId, "climber id");
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase
    .rpc("request_friend", { p_user_id: targetUserId })
    .maybeSingle<FriendRow>();

  if (error) return { error: formatError(error) };
  if (!data) return { error: "Couldn't send that request — try again." };

  // Only tell them when this call is what created the request. The
  // RPC is idempotent, so a double-tap returns the same pending row —
  // notifying on that would push twice for one ask. A `declined` row
  // means the RPC silently refused; saying so would leak the decline.
  if (data.status === "pending" && data.requester_id === auth.userId) {
    const username = await actorUsername(auth.supabase, auth.userId);
    await dispatch(() =>
      notify({
        kind: "friend_request_received",
        recipient: targetUserId,
        actor: auth.userId,
        friendId: data.id,
        fromUsername: username,
      }),
    );
  }

  // Their ask crossed with yours and the RPC resolved it to `active`.
  if (data.status === "active") {
    const username = await actorUsername(auth.supabase, auth.userId);
    await dispatch(() =>
      notify({
        kind: "friend_request_accepted",
        recipient: targetUserId,
        actor: auth.userId,
        accepterUsername: username,
      }),
    );
  }

  revalidatePath("/friends");
  return { success: true, status: data.status };
}

export async function respondToFriend(
  friendId: string,
  accept: boolean,
): Promise<ActionResult<{ status: FriendRow["status"] }>> {
  const auth = await gateSignedInMutation(friendId, "request id");
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase
    .rpc("respond_to_friend", { p_friend_id: friendId, p_accept: accept })
    .maybeSingle<FriendRow>();

  if (error) return { error: formatError(error) };
  if (!data) return { error: "That request is no longer open." };

  // Declines are silent, deliberately: "someone said no" is not a
  // notification anyone benefits from receiving.
  if (data.status === "active") {
    const username = await actorUsername(auth.supabase, auth.userId);
    await dispatch(() =>
      notify({
        kind: "friend_request_accepted",
        recipient: data.requester_id,
        actor: auth.userId,
        accepterUsername: username,
      }),
    );
  }

  revalidatePath("/friends");
  return { success: true, status: data.status };
}

export async function removeFriend(
  targetUserId: string,
): Promise<ActionResult<{ ok: true }>> {
  const auth = await gateSignedInMutation(targetUserId, "climber id");
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase.rpc("remove_friend", {
    p_user_id: targetUserId,
  });
  if (error) return { error: formatError(error) };

  revalidatePath("/friends");
  return { success: true, ok: true };
}

/**
 * "People may send me friend requests."
 *
 * Enforced in `request_friend`, not just here — see migration 108.
 * A privacy switch the server doesn't honour is decoration.
 */
export async function setAllowFriendRequests(
  allow: boolean,
): Promise<ActionResult<{ ok: true }>> {
  const auth = await gateSignedInMutation(null, "profile");
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("profiles")
    .update({ allow_friend_requests: allow })
    .eq("id", auth.userId);
  if (error) return { error: formatError(error) };

  revalidatePath("/friends");
  return { success: true, ok: true };
}

/**
 * Push is best-effort. A failed dispatch must never fail the write
 * that already succeeded — same contract as the crew invite path.
 */
async function dispatch(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    logger.warn("friend_notify_failed", { err: formatErrorForLog(err) });
  }
}
