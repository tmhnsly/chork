import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { asJsonShape } from "./json-shape";
import { readMany } from "./read";
type Supabase = SupabaseClient<Database>;

/**
 * Notification kinds. Kept as a closed TS union so each kind has
 * a typed payload shape downstream; DB check constraint mirrors
 * the same set (migration 033).
 */
export type NotificationKind =
  | "crew_invite_received"
  | "crew_invite_accepted"
  | "crew_ownership_transferred";

export interface CrewInviteReceivedPayload {
  crew_id: string;
  crew_name: string;
  invite_id: string;
  inviter_username: string;
}

export interface CrewInviteAcceptedPayload {
  crew_id: string;
  crew_name: string;
  accepter_username: string;
}

export interface CrewOwnershipTransferredPayload {
  crew_id: string;
  crew_name: string;
  from_username: string;
}

export type NotificationPayload =
  | CrewInviteReceivedPayload
  | CrewInviteAcceptedPayload
  | CrewOwnershipTransferredPayload;

export interface NotificationRow<P = NotificationPayload> {
  id: string;
  kind: NotificationKind;
  payload: P;
  read_at: string | null;
  created_at: string;
}

/**
 * All notifications for the caller, newest first. Capped to a
 * practical limit — older entries can be loaded with a cursor
 * once the UI grows a "load more" affordance.
 */
export async function getNotifications(
  supabase: Supabase,
  limit = 50,
): Promise<NotificationRow[]> {
  type Raw = {
    id: string;
    kind: string;
    payload: unknown;
    read_at: string | null;
    created_at: string;
  };
  const rows = await readMany<Raw>(
    supabase
      .from("notifications")
      .select("id, kind, payload, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    "getnotifications_failed",
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as NotificationKind,
    // `payload` is a jsonb column typed as Json in the generated
    // Supabase types; narrow to the discriminated union via the
    // shared output-side assertion helper. Each row's `kind` tells
    // consumers which branch of the union to read.
    payload: asJsonShape<NotificationPayload>(r.payload),
    read_at: r.read_at,
    created_at: r.created_at,
  }));
}

/**
 * Unread-only count — cheaper than `getNotifications` and used to
 * drive the profile bell's badge dot without pulling payloads.
 *
 * Defense-in-depth: takes an explicit `userId` and filters by it on
 * the wire. RLS already restricts notifications to the caller, but a
 * future cache wrap that uses the service-role client would bypass
 * RLS — the explicit filter keeps the contract correct in both modes.
 */
export async function getUnreadNotificationCount(
  supabase: Supabase,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) {
    logger.warn("getunreadnotificationcount_failed", { err: formatErrorForLog(error) });
    return 0;
  }
  return count ?? 0;
}
