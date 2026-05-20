import "server-only";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { toJson } from "@/lib/data/json-shape";
import { sendPushInBackground } from "@/lib/push/server";
import { tags } from "@/lib/cache/tags";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import type {
  CrewInviteReceivedPayload,
  CrewInviteAcceptedPayload,
  CrewOwnershipTransferredPayload,
} from "@/lib/data/notifications";

/**
 * Notification dispatch — see CONTEXT.md "Notification".
 *
 * One call per domain event. Owns:
 *   - persistent log row insert (notify_user RPC, service-role)
 *   - push dispatch (best-effort, opt-out filtered by category)
 *   - userNotifications tag bust
 *   - self-skip when actor === recipient
 *
 * Caller passes pre-fetched context (crew name, usernames) — keeps
 * the dispatcher free of DB reads so unit tests stay simple. Best-
 * effort throughout: a log-write failure or push throw never unwinds
 * the caller's mutation.
 */

export type NotifyEvent =
  | {
      kind: "crew_invite_received";
      recipient: string;
      actor?: string;
      crewId: string;
      crewName: string;
      inviteId: string;
      inviterUsername: string;
    }
  | {
      kind: "crew_invite_accepted";
      recipient: string;
      actor: string;
      crewId: string;
      crewName: string;
      accepterUsername: string;
    }
  | {
      kind: "crew_ownership_transferred";
      recipient: string;
      actor: string;
      crewId: string;
      crewName: string;
      fromUsername: string;
    };

interface Rendered {
  logKind:
    | "crew_invite_received"
    | "crew_invite_accepted"
    | "crew_ownership_transferred";
  logPayload:
    | CrewInviteReceivedPayload
    | CrewInviteAcceptedPayload
    | CrewOwnershipTransferredPayload;
  pushTitle: string;
  pushBody: string;
  pushUrl: string;
  pushCategory: "invite_received" | "invite_accepted" | "ownership_changed";
}

function render(event: NotifyEvent): Rendered {
  switch (event.kind) {
    case "crew_invite_received":
      return {
        logKind: "crew_invite_received",
        logPayload: {
          crew_id: event.crewId,
          crew_name: event.crewName,
          invite_id: event.inviteId,
          inviter_username: event.inviterUsername,
        },
        pushTitle: "New crew invite",
        pushBody: `@${event.inviterUsername} invited you to ${event.crewName}.`,
        pushUrl: "/crew",
        pushCategory: "invite_received",
      };
    case "crew_invite_accepted":
      return {
        logKind: "crew_invite_accepted",
        logPayload: {
          crew_id: event.crewId,
          crew_name: event.crewName,
          accepter_username: event.accepterUsername,
        },
        pushTitle: "Invite accepted",
        pushBody: `@${event.accepterUsername} joined ${event.crewName}.`,
        pushUrl: "/crew",
        pushCategory: "invite_accepted",
      };
    case "crew_ownership_transferred":
      return {
        logKind: "crew_ownership_transferred",
        logPayload: {
          crew_id: event.crewId,
          crew_name: event.crewName,
          from_username: event.fromUsername,
        },
        pushTitle: "You're now the crew creator",
        pushBody: `@${event.fromUsername} handed ${event.crewName} over to you.`,
        pushUrl: `/crew/${event.crewId}`,
        pushCategory: "ownership_changed",
      };
  }
}

export async function notify(event: NotifyEvent): Promise<void> {
  if (event.actor && event.actor === event.recipient) return;

  const r = render(event);

  try {
    const service = createServiceClient();
    const { error } = await service.rpc("notify_user", {
      p_user_id: event.recipient,
      p_kind: r.logKind,
      // logPayload is one of three fixed-shape interfaces (string
      // fields only). `toJson` is the single documented site that
      // widens a closed interface to the generated `Json` union —
      // see json-shape.ts for the rationale.
      p_payload: toJson(r.logPayload),
    });
    if (error) {
      logger.warn("notify_log_failed", {
        kind: r.logKind,
        err: formatErrorForLog(error),
      });
    }
  } catch (err) {
    logger.warn("notify_log_threw", {
      kind: r.logKind,
      err: formatErrorForLog(err),
    });
  }

  try {
    sendPushInBackground(
      [event.recipient],
      { title: r.pushTitle, body: r.pushBody, url: r.pushUrl },
      { category: r.pushCategory },
    );
  } catch (err) {
    logger.warn("notify_push_threw", {
      kind: r.logKind,
      err: formatErrorForLog(err),
    });
  }

  revalidateTag(tags.userNotifications(event.recipient), "max");
}
