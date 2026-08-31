import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { asJsonShape } from "./json-shape";
import { readMany } from "./read";
import type {
  NotificationKind,
  NotificationPayload,
} from "./notification-kinds";
type Supabase = SupabaseClient<Database>;

/**
 * Kind union + payload shapes live in `./notification-kinds` — the
 * per-kind definition table that also owns each kind's push and
 * in-app renders. Re-exported here so existing importers keep one
 * module path for notification data types. DB check constraint
 * mirrors the same kind set (migration 033, narrowed by 108).
 */
export type {
  NotificationKind,
  NotificationPayload,
  FriendRequestReceivedPayload,
  FriendRequestAcceptedPayload,
} from "./notification-kinds";

export interface NotificationRow<P = NotificationPayload> {
  id: string;
  kind: NotificationKind;
  payload: P;
  read_at: string | null;
  created_at: string;
}

/**
 * The caller's notifications, newest first — scoped to the KINDS a
 * section owns (see `kindsForSection`), since the inbox surfaces
 * per-section rather than as one global sheet. Capped to a
 * practical limit — older entries can be loaded with a cursor once
 * the UI grows a "load more" affordance.
 */
export async function getNotifications(
  supabase: Supabase,
  opts: { kinds?: readonly NotificationKind[]; limit?: number } = {},
): Promise<NotificationRow[]> {
  const { kinds, limit = 50 } = opts;
  type Raw = {
    id: string;
    kind: string;
    payload: unknown;
    read_at: string | null;
    created_at: string;
  };
  let query = supabase
    .from("notifications")
    .select("id, kind, payload, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (kinds && kinds.length > 0) query = query.in("kind", [...kinds]);
  const rows = await readMany<Raw>(query, "getnotifications_failed");
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

