import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { latestDefinition } from "@/test/sql-definitions";
import {
  notificationKinds,
  isNotificationKind,
  renderNotification,
  renderNotificationInApp,
} from "./notification-kinds";

const FRIEND_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/**
 * The kind set has SQL homes, and the pins read them — not a third
 * hand-typed list. A hand list once claimed to mirror the constraint
 * while `notify_user`'s own allow-list drifted: every friend
 * notification since 108 raised "unknown notification kind", notify()
 * swallowed it, and the failure ran silent for three days (migration
 * 130's postmortem). `create or replace` / drop-and-add mean the LAST
 * definition in filename order wins, so both parsers resolve that
 * way, like every other SQL-pinned test.
 */
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function quoted(fragment: string): string[] {
  return [...fragment.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** The live `notifications_kind_check` constraint — 033's inline
 *  `kind in (…)` shape, superseded by 108/129's `add constraint …
 *  kind = any (array[…])` shape; last migration wins. */
function liveConstraintKinds(): string[] {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let found: string[] | null = null;
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS, file), "utf8");
    const added = [...text.matchAll(
      /add constraint notifications_kind_check\s+check \(kind = any \(array\[([\s\S]*?)\]/g,
    )];
    if (added.length > 0) found = quoted(added[added.length - 1][1]);
    else {
      const inline = text.match(/kind\s+text not null check \(kind in \(([\s\S]*?)\)\)/);
      if (inline) found = quoted(inline[1]);
    }
  }
  if (!found) throw new Error("no notifications_kind_check in migrations");
  return found;
}

const EXPECTED_KINDS = liveConstraintKinds();

describe("notificationKinds table", () => {
  it("has exactly one entry per kind in the LIVE DB constraint", () => {
    expect(Object.keys(notificationKinds).sort()).toEqual(
      [...EXPECTED_KINDS].sort(),
    );
  });

  it("notify_user keeps NO allow-list of its own — the constraint is the single gate", () => {
    // 130's fix was to DELETE the function's second list, not update
    // it: two allow-lists was the bug (every friend notification
    // since 108 raised "unknown notification kind" for three silent
    // days). This pins the deletion — if a p_kind guard ever grows
    // back, the two-homes failure class comes back with it.
    const body = latestDefinition("notify_user").body;
    expect(body).not.toMatch(/p_kind\s+not in/);
    expect(body).toMatch(/insert into public\.notifications/);
  });

  it("every entry defines toPayload, push and inApp", () => {
    for (const kind of Object.keys(notificationKinds) as (keyof typeof notificationKinds)[]) {
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
