import "server-only";
import type { Database } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  CrewInviteReceivedPayload,
  CrewInviteAcceptedPayload,
  CrewOwnershipTransferredPayload,
} from "@/lib/data/notifications";

/**
 * Discriminated-union helper. Each kind's payload is typed so a
 * caller that passes the wrong shape trips TypeScript rather than
 * producing a malformed row at runtime.
 */
export type NotifyArgs =
  | { kind: "crew_invite_received"; payload: CrewInviteReceivedPayload }
  | { kind: "crew_invite_accepted"; payload: CrewInviteAcceptedPayload }
  | { kind: "crew_ownership_transferred"; payload: CrewOwnershipTransferredPayload };

/**
 * Insert a notification row via the `notify_user` SQL helper.
 *
 * Uses the service-role client because migration 040 revoked execute
 * from `authenticated` — any authed user could previously call the
 * RPC with an arbitrary `p_user_id`, which was a spoofing surface.
 * Server code is trusted, so we hit it via the service role.
 *
 * Swallows errors so a notification log failure can never break the
 * primary mutation (e.g. an invite still succeeds even if the log
 * insert fails).
 */
export async function notifyUser(
  userId: string,
  args: NotifyArgs,
): Promise<void> {
  try {
    const service = createServiceClient();
    const { error } = await service.rpc("notify_user", {
      p_user_id: userId,
      p_kind: args.kind,
      p_payload: args.payload as unknown as Database["public"]["Functions"]["notify_user"]["Args"]["p_payload"],
    });
    if (error) {
      console.warn("[chork] notifyUser failed:", error);
    }
  } catch (err) {
    console.warn("[chork] notifyUser threw:", err);
  }
}
