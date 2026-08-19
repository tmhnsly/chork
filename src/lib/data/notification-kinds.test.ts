import { describe, it, expect } from "vitest";
import {
  notificationKinds,
  isNotificationKind,
  renderNotification,
  renderNotificationInApp,
  type NotificationKind,
} from "./notification-kinds";

const FRIEND_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/**
 * The closed kind set — mirrors the DB check constraint (migration 033,
 * narrowed to friends-only by 108, widened by 129 for match invites).
 *
 * Spelled out by hand on purpose: deriving it from `notificationKinds`
 * would make the test pass for any pair of matching mistakes. This is
 * the list you have to change deliberately, and changing it without
 * the migration means a `notify()` that typechecks and then fails at
 * insert with a 23514.
 */
const EXPECTED_KINDS: NotificationKind[] = [
  "friend_request_received",
  "friend_request_accepted",
  "match_invite_received",
];

describe("notificationKinds table", () => {
  it("has exactly one entry per kind in the DB constraint", () => {
    expect(Object.keys(notificationKinds).sort()).toEqual(
      [...EXPECTED_KINDS].sort(),
    );
  });

  it("every entry defines toPayload, push and inApp", () => {
    for (const kind of EXPECTED_KINDS) {
      const def = notificationKinds[kind];
      expect(typeof def.toPayload).toBe("function");
      expect(typeof def.push).toBe("function");
      expect(typeof def.inApp).toBe("function");
    }
  });

  it("push urls and in-app hrefs are same-origin paths (service-worker contract)", () => {
    // The service worker only opens single-leading-slash paths; any
    // other shape silently falls back to "/". Pin every kind's url.
    const events: Parameters<typeof renderNotification>[0][] = [
      {
        kind: "friend_request_received",
        recipient: "u2",
        actor: "u1",
        friendId: FRIEND_1,
        fromUsername: "alice",
      },
      {
        kind: "friend_request_accepted",
        recipient: "u1",
        actor: "u2",
        accepterUsername: "bob",
      },
      {
        kind: "match_invite_received",
        recipient: "u2",
        actor: "u1",
        setId: FRIEND_1,
        code: "AB2CD3",
        matchName: "Friday sesh",
        fromUsername: "alice",
      },
    ];
    expect(events.map((e) => e.kind).sort()).toEqual([...EXPECTED_KINDS].sort());
    for (const event of events) {
      const { payload, push } = renderNotification(event);
      expect(push.url).toMatch(/^\/(?!\/)/);
      const inApp = renderNotificationInApp(event.kind, payload);
      expect(inApp?.href).toMatch(/^\/(?!\/)/);
    }
  });
});




describe("renderNotification (dispatch seam)", () => {
  it("produces payload + push for a full event object", () => {
    const { payload, push } = renderNotification({
      kind: "friend_request_received",
      recipient: "u2",
      actor: "u1",
      friendId: FRIEND_1,
      fromUsername: "alice",
    });
    expect(payload).toEqual({
      friend_id: FRIEND_1,
      from_username: "alice",
    });
    expect(push.title).toBe("New friend request");
    expect(push.category).toBe("invite_received");
  });
});

describe("unknown / future kinds", () => {
  it("isNotificationKind rejects unknown kinds and prototype names", () => {
    expect(isNotificationKind("friend_request_received")).toBe(true);
    // Crews are gone — their kinds must not linger as valid.
    expect(isNotificationKind("crew_invite_received")).toBe(false);
    expect(isNotificationKind("comment_liked")).toBe(false);
    expect(isNotificationKind("")).toBe(false);
    // hasOwnProperty guard — inherited Object members must not match.
    expect(isNotificationKind("toString")).toBe(false);
    expect(isNotificationKind("constructor")).toBe(false);
  });

  it("renderNotificationInApp returns null so the sheet can skip the row", () => {
    expect(renderNotificationInApp("comment_liked", { foo: "bar" })).toBeNull();
  });

  it("renderNotificationInApp renders a known kind from a raw DB row", () => {
    const content = renderNotificationInApp("friend_request_accepted", {
      accepter_username: "bob",
    });
    expect(content).not.toBeNull();
    expect(content?.href).toBe("/friends");
    expect(content?.segments).toContainEqual({
      type: "user",
      username: "bob",
    });
  });
});

describe("friend_request_received", () => {
  const def = notificationKinds.friend_request_received;
  const payload = def.toPayload({
    actor: "u1",
    friendId: FRIEND_1,
    fromUsername: "alice",
  });

  it("carries the link id, so the in-app row can act on it", () => {
    expect(payload.friend_id).toBe(FRIEND_1);
  });

  it("adds the @ at render, never in storage", () => {
    // The domain rule lives in the renderer — a stored "@alice" would
    // come back out as "@@alice".
    expect(payload.from_username).toBe("alice");
    expect(def.push(payload).body).toContain("@alice");
  });

  it("reuses the invite opt-in category", () => {
    // The category outlived crews: a climber who muted "someone asked
    // me something" has said what they think about being asked.
    expect(def.push(payload).category).toBe("invite_received");
  });
});

describe("friend_request_accepted", () => {
  const def = notificationKinds.friend_request_accepted;
  const payload = def.toPayload({ actor: "u2", accepterUsername: "bob" });

  it("names who accepted", () => {
    expect(def.push(payload).body).toContain("@bob");
    expect(def.inApp(payload).segments[0]).toEqual({
      type: "user",
      username: "bob",
    });
  });
});

describe("match_invite_received", () => {
  const event = {
    kind: "match_invite_received" as const,
    recipient: "u2",
    actor: "u1",
    setId: FRIEND_1,
    code: "AB2CD3",
    matchName: "Friday sesh",
    fromUsername: "alice",
  };

  it("carries the join code into the tap target", () => {
    // The invite IS the code. Tapping it must land on the join page
    // with the code already filled in — that is what makes it an
    // invite the recipient can act on in one tap, rather than a
    // message they have to transcribe from.
    const { push, payload } = renderNotification(event);
    expect(push.url).toBe("/match/join?code=AB2CD3");
    expect(renderNotificationInApp(event.kind, payload)?.href).toBe(
      "/match/join?code=AB2CD3",
    );
  });

  it("uses the invite push category, so the opt-out applies", () => {
    // `push_invite_received` is the recipient's switch for "tell me
    // when someone asks". A match invite that bypassed it would be
    // exactly the spam that switch exists to stop.
    expect(renderNotification(event).push.category).toBe("invite_received");
  });

  it("names the match, or says 'a match' when it has no name", () => {
    expect(renderNotification(event).push.body).toContain("Friday sesh");
    const unnamed = renderNotification({ ...event, matchName: null });
    expect(unnamed.push.body).toContain("a match");
    expect(unnamed.push.body).not.toContain("null");
  });
});
