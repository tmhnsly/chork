/**
 * Per-kind notification definition table.
 *
 * A notification KIND's whole identity lives in ONE entry here —
 * the same co-location move as `errors.ts`'s code→copy tables:
 *
 *   • payload shape persisted to `notifications.payload` (jsonb)
 *   • camelCase event fields the `notify()` call site passes
 *   • push render (title / body / url / opt-out category)
 *   • in-app render (icon key / deep link / message segments)
 *
 * Adding a kind = one payload interface + one `NotificationPayloads`
 * / `NotificationEventFields` line + one table entry below (plus the
 * DB check constraint — see migration 033). A missing table entry is
 * a compile error: the table's type is mapped over `NotificationKind`.
 *
 * This module is intentionally pure (no Supabase, no JSX, no
 * server-only imports) so both the server dispatcher (`notify.ts`)
 * and the client sheet (`NotificationsSheet.tsx`) can consume it.
 * `inApp` returns STRUCTURED segments, not JSX — the sheet maps them
 * to elements generically, which keeps per-kind copy unit-testable.
 */

// ── Payload shapes (persisted rows — snake_case, string fields) ──

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

/**
 * kind → payload map. `NotificationKind` derives from these keys, so
 * the union and the table can never drift: adding a key here without
 * a matching `notificationKinds` entry fails the build, and vice
 * versa. The DB check constraint (migration 033) mirrors this set.
 */
export interface NotificationPayloads {
  crew_invite_received: CrewInviteReceivedPayload;
  crew_invite_accepted: CrewInviteAcceptedPayload;
  crew_ownership_transferred: CrewOwnershipTransferredPayload;
}

export type NotificationKind = keyof NotificationPayloads;

export type NotificationPayload = NotificationPayloads[NotificationKind];

/**
 * kind → camelCase fields each `notify()` event carries beyond the
 * base `{ kind, recipient, actor? }`. Kinds where the actor is
 * semantically required list `actor: string` here so the intersection
 * makes it non-optional on that branch of `NotificationEvent`.
 */
export interface NotificationEventFields {
  crew_invite_received: {
    crewId: string;
    crewName: string;
    inviteId: string;
    inviterUsername: string;
  };
  crew_invite_accepted: {
    actor: string;
    crewId: string;
    crewName: string;
    accepterUsername: string;
  };
  crew_ownership_transferred: {
    actor: string;
    crewId: string;
    crewName: string;
    fromUsername: string;
  };
}

/** Discriminated union of every dispatchable notification event. */
export type NotificationEvent = {
  [K in NotificationKind]: {
    kind: K;
    recipient: string;
    actor?: string;
  } & NotificationEventFields[K];
}[NotificationKind];

// ── Render output shapes ──

/**
 * Mirrors `PushCategory` in `@/lib/push/server` (which is
 * server-only, so this client-safe module can't import it). The
 * `notify.ts` call site passes `push.category` straight into
 * `sendPushInBackground`, so a value here that drifts from the real
 * union fails the build there.
 */
export type NotificationPushCategory =
  | "invite_received"
  | "invite_accepted"
  | "ownership_changed";

export interface PushContent {
  title: string;
  body: string;
  /** Same-origin path — the service worker rejects anything else. */
  url: string;
  category: NotificationPushCategory;
}

/**
 * Icon keys, not components — keeps JSX out of this module. The
 * sheet holds an exhaustive `Record<NotificationIcon, IconType>`
 * map, so a new key here forces a one-line icon mapping there.
 */
export type NotificationIcon = "user-plus" | "check" | "crown";

/**
 * Structured in-app message parts. The sheet renders these
 * generically: `text` as plain text, `user` as a bold `@username`,
 * `crew` as a bold crew name. Usernames are stored WITHOUT the `@`
 * prefix — the renderer adds it (one place, per the domain rule).
 */
export type NotificationSegment =
  | { type: "text"; text: string }
  | { type: "user"; username: string }
  | { type: "crew"; name: string };

export interface InAppContent {
  icon: NotificationIcon;
  href: string;
  segments: NotificationSegment[];
}

export interface NotificationKindDef<K extends NotificationKind> {
  /** camelCase event fields → persisted snake_case payload. */
  toPayload(fields: NotificationEventFields[K]): NotificationPayloads[K];
  /** Push copy — must be derivable from the payload alone. */
  push(payload: NotificationPayloads[K]): PushContent;
  /** In-app list copy — must be derivable from the payload alone. */
  inApp(payload: NotificationPayloads[K]): InAppContent;
}

// ── The table ──

export const notificationKinds: {
  [K in NotificationKind]: NotificationKindDef<K>;
} = {
  crew_invite_received: {
    toPayload: (e) => ({
      crew_id: e.crewId,
      crew_name: e.crewName,
      invite_id: e.inviteId,
      inviter_username: e.inviterUsername,
    }),
    push: (p) => ({
      title: "New crew invite",
      body: `@${p.inviter_username} invited you to ${p.crew_name}.`,
      url: "/crew",
      category: "invite_received",
    }),
    inApp: (p) => ({
      icon: "user-plus",
      href: "/crew",
      segments: [
        { type: "user", username: p.inviter_username },
        { type: "text", text: " invited you to " },
        { type: "crew", name: p.crew_name },
      ],
    }),
  },

  crew_invite_accepted: {
    toPayload: (e) => ({
      crew_id: e.crewId,
      crew_name: e.crewName,
      accepter_username: e.accepterUsername,
    }),
    push: (p) => ({
      title: "Invite accepted",
      body: `@${p.accepter_username} joined ${p.crew_name}.`,
      url: "/crew",
      category: "invite_accepted",
    }),
    inApp: (p) => ({
      icon: "check",
      href: `/crew/${p.crew_id}`,
      segments: [
        { type: "user", username: p.accepter_username },
        { type: "text", text: " joined " },
        { type: "crew", name: p.crew_name },
      ],
    }),
  },

  crew_ownership_transferred: {
    toPayload: (e) => ({
      crew_id: e.crewId,
      crew_name: e.crewName,
      from_username: e.fromUsername,
    }),
    push: (p) => ({
      title: "You're now the crew creator",
      body: `@${p.from_username} handed ${p.crew_name} over to you.`,
      url: `/crew/${p.crew_id}`,
      category: "ownership_changed",
    }),
    inApp: (p) => ({
      icon: "crown",
      href: `/crew/${p.crew_id}`,
      segments: [
        { type: "user", username: p.from_username },
        { type: "text", text: " made you the creator of " },
        { type: "crew", name: p.crew_name },
      ],
    }),
  },
};

// ── Lookup + dispatch helpers (the single typed seam) ──

export function isNotificationKind(kind: string): kind is NotificationKind {
  return Object.prototype.hasOwnProperty.call(notificationKinds, kind);
}

/**
 * Event → persisted payload + push copy, for `notify()`'s dispatch.
 *
 * The two assertions below are the module's single typed seam:
 * `event.kind` discriminates the union, but TypeScript can't
 * correlate the table lookup with the narrowed event across a mapped
 * record, so we widen once here instead of scattering per-call casts.
 * Each table entry is itself fully typed per-kind, so the copy stays
 * checked where it's written.
 */
export function renderNotification(event: NotificationEvent): {
  payload: NotificationPayload;
  push: PushContent;
} {
  const def = notificationKinds[event.kind];
  const payload = (def.toPayload as (e: NotificationEvent) => NotificationPayload)(
    event,
  );
  const push = (def.push as (p: NotificationPayload) => PushContent)(payload);
  return { payload, push };
}

/**
 * DB row (`kind` + jsonb `payload`) → in-app content for the sheet.
 *
 * Output-side assertion in the `asJsonShape` tradition: the writer
 * (`notify()`) guarantees the payload matches its kind, so the row's
 * `kind` is the contract for the shape. Unknown / future kinds — a
 * newer DB constraint than this bundle — return `null` so the sheet
 * can skip the row gracefully instead of rendering garbage.
 */
export function renderNotificationInApp(
  kind: string,
  payload: unknown,
): InAppContent | null {
  if (!isNotificationKind(kind)) return null;
  const def = notificationKinds[kind];
  return (def.inApp as (p: unknown) => InAppContent)(payload);
}
