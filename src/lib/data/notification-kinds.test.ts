import { describe, it, expect } from "vitest";
import {
  notificationKinds,
  isNotificationKind,
  renderNotification,
  renderNotificationInApp,
  type NotificationKind,
} from "./notification-kinds";

const CREW_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** The closed kind set — mirrors the DB check constraint (migration 033). */
const EXPECTED_KINDS: NotificationKind[] = [
  "crew_invite_received",
  "crew_invite_accepted",
  "crew_ownership_transferred",
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
        kind: "crew_invite_received",
        recipient: "u2",
        crewId: CREW_1,
        crewName: "Tuesday Crew",
        inviteId: "i1",
        inviterUsername: "alice",
      },
      {
        kind: "crew_invite_accepted",
        recipient: "u1",
        actor: "u2",
        crewId: CREW_1,
        crewName: "Tuesday Crew",
        accepterUsername: "bob",
      },
      {
        kind: "crew_ownership_transferred",
        recipient: "u2",
        actor: "u1",
        crewId: CREW_1,
        crewName: "Tuesday Crew",
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

describe("crew_invite_received", () => {
  const def = notificationKinds.crew_invite_received;
  const payload = def.toPayload({
    crewId: CREW_1,
    crewName: "Tuesday Crew",
    inviteId: "i1",
    inviterUsername: "alice",
  });

  it("maps camelCase event fields to the persisted snake_case payload", () => {
    expect(payload).toEqual({
      crew_id: CREW_1,
      crew_name: "Tuesday Crew",
      invite_id: "i1",
      inviter_username: "alice",
    });
  });

  it("push copy", () => {
    expect(def.push(payload)).toEqual({
      title: "New crew invite",
      body: "@alice invited you to Tuesday Crew.",
      url: "/crew",
      category: "invite_received",
    });
  });

  it("in-app segments", () => {
    expect(def.inApp(payload)).toEqual({
      icon: "user-plus",
      href: "/crew",
      segments: [
        { type: "user", username: "alice" },
        { type: "text", text: " invited you to " },
        { type: "crew", name: "Tuesday Crew" },
      ],
    });
  });
});

describe("crew_invite_accepted", () => {
  const def = notificationKinds.crew_invite_accepted;
  const payload = def.toPayload({
    actor: "u2",
    crewId: CREW_1,
    crewName: "Tuesday Crew",
    accepterUsername: "bob",
  });

  it("maps camelCase event fields to the persisted snake_case payload", () => {
    expect(payload).toEqual({
      crew_id: CREW_1,
      crew_name: "Tuesday Crew",
      accepter_username: "bob",
    });
  });

  it("push copy", () => {
    expect(def.push(payload)).toEqual({
      title: "Invite accepted",
      body: "@bob joined Tuesday Crew.",
      url: "/crew",
      category: "invite_accepted",
    });
  });

  it("in-app segments deep-link to the crew", () => {
    expect(def.inApp(payload)).toEqual({
      icon: "check",
      href: `/crew/${CREW_1}`,
      segments: [
        { type: "user", username: "bob" },
        { type: "text", text: " joined " },
        { type: "crew", name: "Tuesday Crew" },
      ],
    });
  });
});

describe("crew_ownership_transferred", () => {
  const def = notificationKinds.crew_ownership_transferred;
  const payload = def.toPayload({
    actor: "u1",
    crewId: CREW_1,
    crewName: "Tuesday Crew",
    fromUsername: "alice",
  });

  it("maps camelCase event fields to the persisted snake_case payload", () => {
    expect(payload).toEqual({
      crew_id: CREW_1,
      crew_name: "Tuesday Crew",
      from_username: "alice",
    });
  });

  it("push copy targets the specific crew", () => {
    expect(def.push(payload)).toEqual({
      title: "You're now the crew creator",
      body: "@alice handed Tuesday Crew over to you.",
      url: `/crew/${CREW_1}`,
      category: "ownership_changed",
    });
  });

  it("in-app segments", () => {
    expect(def.inApp(payload)).toEqual({
      icon: "crown",
      href: `/crew/${CREW_1}`,
      segments: [
        { type: "user", username: "alice" },
        { type: "text", text: " made you the creator of " },
        { type: "crew", name: "Tuesday Crew" },
      ],
    });
  });
});

describe("renderNotification (dispatch seam)", () => {
  it("produces payload + push for a full event object", () => {
    const { payload, push } = renderNotification({
      kind: "crew_invite_received",
      recipient: "u2",
      actor: "u1",
      crewId: CREW_1,
      crewName: "Tuesday Crew",
      inviteId: "i1",
      inviterUsername: "alice",
    });
    expect(payload).toEqual({
      crew_id: CREW_1,
      crew_name: "Tuesday Crew",
      invite_id: "i1",
      inviter_username: "alice",
    });
    expect(push.title).toBe("New crew invite");
    expect(push.category).toBe("invite_received");
  });
});

describe("unknown / future kinds", () => {
  it("isNotificationKind rejects unknown kinds and prototype names", () => {
    expect(isNotificationKind("crew_invite_received")).toBe(true);
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
    const content = renderNotificationInApp("crew_invite_accepted", {
      crew_id: CREW_1,
      crew_name: "Tuesday Crew",
      accepter_username: "bob",
    });
    expect(content).not.toBeNull();
    expect(content?.href).toBe(`/crew/${CREW_1}`);
    expect(content?.segments).toContainEqual({
      type: "user",
      username: "bob",
    });
  });
});
