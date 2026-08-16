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

export interface FriendRequestReceivedPayload {
  /** The link's own id — the in-app row acts on it directly. */
  friend_id: string;
  from_username: string;
}

export interface FriendRequestAcceptedPayload {
  accepter_username: string;
}

/**
 * kind → payload map. `NotificationKind` derives from these keys, so
 * the union and the table can never drift: adding a key here without
 * a matching `notificationKinds` entry fails the build, and vice
 * versa. The DB check constraint (migration 033) mirrors this set.
 */
export interface NotificationPayloads {
  friend_request_received: FriendRequestReceivedPayload;
  friend_request_accepted: FriendRequestAcceptedPayload;
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
  friend_request_received: {
    actor: string;
    friendId: string;
    fromUsername: string;
  };
  friend_request_accepted: {
    actor: string;
    accepterUsername: string;
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
export type NotificationIcon = "user-plus" | "check";

/**
 * Structured in-app message parts. The sheet renders these
 * generically: `text` as plain text and `user` as a bold `@username`.
 * Usernames are stored WITHOUT the `@`
 * prefix — the renderer adds it (one place, per the domain rule).
 */
export type NotificationSegment =
  | { type: "text"; text: string }
  | { type: "user"; username: string };

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



  // Friend requests reuse the push CATEGORIES that came in with crew
  // invites (`invite_received` / `invite_accepted`). The opt-in
  // columns outlived crews on purpose: "tell me when someone asks"
  // and "tell me when someone says yes" are the same preference
  // whatever the thing being asked is.
  friend_request_received: {
    toPayload: (e) => ({
      friend_id: e.friendId,
      from_username: e.fromUsername,
    }),
    push: (p) => ({
      title: "New friend request",
      body: `@${p.from_username} wants to be friends.`,
      url: "/friends",
      category: "invite_received",
    }),
    inApp: (p) => ({
      icon: "user-plus",
      href: "/friends",
      segments: [
        { type: "user", username: p.from_username },
        { type: "text", text: " wants to be friends" },
      ],
    }),
  },

  friend_request_accepted: {
    toPayload: (e) => ({
      accepter_username: e.accepterUsername,
    }),
    push: (p) => ({
      title: "You're friends",
      body: `@${p.accepter_username} accepted your friend request.`,
      url: "/friends",
      category: "invite_accepted",
    }),
    inApp: (p) => ({
      icon: "check",
      href: "/friends",
      segments: [
        { type: "user", username: p.accepter_username },
        { type: "text", text: " accepted your friend request" },
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
