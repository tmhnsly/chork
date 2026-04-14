import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type {
  NotificationKind,
  CrewInviteReceivedPayload,
  CrewInviteAcceptedPayload,
  CrewOwnershipTransferredPayload,
} from "@/lib/data/notifications";

type Supabase = SupabaseClient<Database>;

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
 * Insert a notification row via the `notify_user` SQL helper. Uses
 * the caller's supabase client (RLS-authenticated) — the helper is
 * SECURITY DEFINER so it can write past the table's insert-blocking
 * policies. Swallows errors so a notification log failure can never
 * break the primary mutation (e.g. an invite succeeds even if the
 * log insert fails).
 */
export async function notifyUser(
  supabase: Supabase,
  userId: string,
  args: NotifyArgs,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("notify_user", {
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
