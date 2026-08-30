import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => fn(),
}));
// Auth is exercised for real: `gateSignedInMutation` (uuid check →
// requireSignedIn → rate limit) runs its actual implementation, with
// only the supabase/server primitives and the rate limiter mocked.
// Mocking @/lib/auth wholesale here would turn the validation +
// rate-limit assertions below into tests of the mock.
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
  createServerSupabase: vi.fn(),
  getServerUser: vi.fn(),
  getServerProfile: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ enforce: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
vi.mock("@/lib/achievements/context", () => ({
  buildBadgeContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/achievements/evaluate", () => ({
  evaluateAndPersistAchievements: vi.fn(),
}));

const USER_A = "11111111-1111-1111-1111-111111111111";
const MATCH_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ROUTE_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const AUTH_REQUIRED = "You need to be signed in to do that";

beforeEach(async () => {
  vi.resetAllMocks();
  // endMatchAction's deferred housekeeping reads match_summary_players via
  // the service client; default it to an empty roster.
  const { createServiceClient } = await import("@/lib/supabase/server");
  vi.mocked(createServiceClient).mockReturnValue(
    createMockSupabase() as never,
  );
  // Default the rate limit to allowing the request; the dedicated
  // rate-limit test overrides per-test.
  const { enforce } = await import("@/lib/rate-limit");
  vi.mocked(enforce).mockResolvedValue({ ok: true });
});

/** Prime auth with a harness client; returns it for call assertions. */
async function mockSignedIn(
  primed: Parameters<typeof createMockSupabase>[0] = {},
) {
  const sb = createMockSupabase(primed);
  const { createServerSupabase, getServerUser } = await import(
    "@/lib/supabase/server"
  );
  vi.mocked(createServerSupabase).mockResolvedValue(sb as never);
  vi.mocked(getServerUser).mockResolvedValue({ id: USER_A } as never);
  return sb;
}

async function mockAuthFailure() {
  const { createServerSupabase, getServerUser } = await import(
    "@/lib/supabase/server"
  );
  vi.mocked(createServerSupabase).mockResolvedValue(
    createMockSupabase() as never,
  );
  vi.mocked(getServerUser).mockResolvedValue(null);
}

describe("createMatchAction", () => {
  it("rejects an invalid grading scale", async () => {
    const { createMatchAction } = await import("./actions");
    const result = await createMatchAction({
      name: null,
      location: null,
      gradingScale: "nope" as never,
    });
    expect(result).toEqual({ error: "Invalid grading scale" });
  });

  it("requires a min + max grade for V-scale", async () => {
    const { createMatchAction } = await import("./actions");
    const result = await createMatchAction({
      gradingScale: "v",
    });
    expect(result).toEqual({ error: expect.stringContaining("min and max") });
  });

  it("rejects a min grade out of range", async () => {
    const { createMatchAction } = await import("./actions");
    const result = await createMatchAction({
      gradingScale: "v",
      minGrade: -1,
      maxGrade: 5,
    });
    expect(result).toEqual({ error: expect.stringContaining("Min grade") });
  });

  it("rejects a max grade below the min", async () => {
    const { createMatchAction } = await import("./actions");
    const result = await createMatchAction({
      gradingScale: "v",
      minGrade: 5,
      maxGrade: 3,
    });
    expect(result).toEqual({ error: expect.stringContaining("Max grade") });
  });

  it("rejects a custom scale with no grades", async () => {
    const { createMatchAction } = await import("./actions");
    const result = await createMatchAction({
      gradingScale: "custom",
      customGrades: [],
    });
    expect(result).toEqual({ error: expect.stringContaining("at least one") });
  });

  it("rejects a custom scale with more than 50 grades", async () => {
    const { createMatchAction } = await import("./actions");
    const tooMany = Array.from({ length: 51 }, (_, i) => `g${i}`);
    const result = await createMatchAction({
      gradingScale: "custom",
      customGrades: tooMany,
    });
    expect(result).toEqual({ error: expect.stringContaining("Max 50") });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { createMatchAction } = await import("./actions");
    expect(await createMatchAction({ gradingScale: "points" })).toEqual({
      error: AUTH_REQUIRED,
    });
  });

  it("accepts a points-scale match without grades", async () => {
    // Regression: points matches used to fall into the custom-grades
    // branch and always return "Add at least one custom grade".
    const sb = await mockSignedIn({
      "rpc:create_match": { data: [{ id: MATCH_1, code: "ABCDEF" }], error: null },
    });

    const { createMatchAction } = await import("./actions");
    const result = await createMatchAction({
      gradingScale: "points",
    });
    expect(result).toEqual({ success: true, id: MATCH_1, code: "ABCDEF" });

    const rpc = sb.calls.find((c) => c.source === "create_match");
    expect(rpc?.args[0]).toEqual(
      expect.objectContaining({
        p_grading_scale: "points",
        p_custom_grades: undefined,
        p_min_grade: undefined,
        p_max_grade: undefined,
      }),
    );
  });

  it("accepts a V-scale match with valid bounds", async () => {
    await mockSignedIn({
      "rpc:create_match": { data: [{ id: MATCH_1, code: "ABCDEF" }], error: null },
    });

    const { createMatchAction } = await import("./actions");
    const result = await createMatchAction({
      gradingScale: "v",
      minGrade: 0,
      maxGrade: 5,
    });
    expect(result).toEqual({ success: true, id: MATCH_1, code: "ABCDEF" });
  });

  it("maps an RPC failure to a friendly error", async () => {
    await mockSignedIn({
      "rpc:create_match": {
        data: null,
        error: { code: "42501", message: "rls denies" },
      },
    });
    const { createMatchAction } = await import("./actions");
    expect(await createMatchAction({ gradingScale: "points" })).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});

describe("match write rate limiting", () => {
  // All seven match writes shipped with NO rate limit while every other
  // mutation tier had one — pinned here so the gate can't quietly be
  // dropped again. gateSignedInMutation defaults the limit ON.
  it("createMatchAction surfaces the rate-limit error when the bucket trips", async () => {
    await mockSignedIn();
    const { enforce } = await import("@/lib/rate-limit");
    vi.mocked(enforce).mockResolvedValueOnce({
      ok: false,
      error: "Too many requests. Try again in 42s.",
      retryAfter: 42,
    });
    const { createMatchAction } = await import("./actions");
    expect(await createMatchAction({ gradingScale: "points" })).toEqual({
      error: "Too many requests. Try again in 42s.",
    });
  });

  it("upsertMatchLogAction enforces the mutationsWrite bucket", async () => {
    await mockSignedIn();
    const { enforce } = await import("@/lib/rate-limit");
    const { upsertMatchLogAction } = await import("./actions");
    await upsertMatchLogAction({
      matchRouteId: ROUTE_1,
      attempts: 1,
      completed: true,
      zone: false,
    });
    expect(enforce).toHaveBeenCalledWith("mutationsWrite", USER_A);
  });
});

describe("joinMatchAction", () => {
  it("rejects a malformed match id", async () => {
    const { joinMatchAction } = await import("./actions");
    const result = await joinMatchAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid match id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { joinMatchAction } = await import("./actions");
    expect(await joinMatchAction(MATCH_1)).toEqual({ error: AUTH_REQUIRED });
  });

  it("joins via the join_match RPC on success", async () => {
    const sb = await mockSignedIn();
    const { joinMatchAction } = await import("./actions");
    expect(await joinMatchAction(MATCH_1)).toEqual({ success: true });
    const rpc = sb.calls.find((c) => c.source === "join_match");
    expect(rpc?.args[0]).toEqual({ p_set_id: MATCH_1 });
  });

  it("maps an RPC failure (match full / ended) to a friendly error", async () => {
    await mockSignedIn({
      "rpc:join_match": {
        data: null,
        error: { code: "23514", message: "match is full" },
      },
    });
    const { joinMatchAction } = await import("./actions");
    const result = await joinMatchAction(MATCH_1);
    expect("error" in result).toBe(true);
  });
});

describe("leaveMatchAction", () => {
  it("rejects a malformed match id", async () => {
    const { leaveMatchAction } = await import("./actions");
    const result = await leaveMatchAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid match id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { leaveMatchAction } = await import("./actions");
    expect(await leaveMatchAction(MATCH_1)).toEqual({ error: AUTH_REQUIRED });
  });

  // Leaving parks the row via RLS rather than an RPC — `set_players`
  // update is `user_id = auth.uid()` on both sides, which is the whole
  // rule. See the note on leaveMatchAction.
  it("parks the player row rather than deleting it", async () => {
    const sb = await mockSignedIn();
    const { leaveMatchAction } = await import("./actions");
    expect(await leaveMatchAction(MATCH_1)).toEqual({ success: true });
    const call = sb.calls.find((c) => c.source === "set_players");
    expect(call).toBeTruthy();
    const update = sb.calls.find((c) => c.method === "update");
    // A timestamp, not a delete: the history has to stay readable.
    expect(update?.args[0]).toMatchObject({ left_at: expect.any(String) });
    expect(sb.calls.some((c) => c.method === "delete")).toBe(false);
  });
});

describe("addMatchRouteAction", () => {
  it("rejects a malformed match id", async () => {
    const { addMatchRouteAction } = await import("./actions");
    const result = await addMatchRouteAction({ matchId: "not-a-uuid" });
    expect(result).toEqual({ error: "Invalid match id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { addMatchRouteAction } = await import("./actions");
    expect(await addMatchRouteAction({ matchId: MATCH_1 })).toEqual({
      error: AUTH_REQUIRED,
    });
  });

  it("returns the created route row so the client can upsert without waiting on realtime", async () => {
    const route = { id: ROUTE_1, match_id: MATCH_1, number: 1 };
    await mockSignedIn({
      "rpc:add_match_route": { data: route, error: null },
    });
    const { addMatchRouteAction } = await import("./actions");
    expect(await addMatchRouteAction({ matchId: MATCH_1 })).toEqual({ success: true, route });
  });

  it("maps an RPC failure to a friendly error", async () => {
    await mockSignedIn({
      "rpc:add_match_route": {
        data: null,
        error: { code: "42501", message: "not a player" },
      },
    });
    const { addMatchRouteAction } = await import("./actions");
    expect(await addMatchRouteAction({ matchId: MATCH_1 })).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});

describe("updateMatchRouteAction", () => {
  it("rejects a malformed route id", async () => {
    const { updateMatchRouteAction } = await import("./actions");
    const result = await updateMatchRouteAction({ routeId: "not-a-uuid" });
    expect(result).toEqual({ error: "Invalid route id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { updateMatchRouteAction } = await import("./actions");
    expect(await updateMatchRouteAction({ routeId: ROUTE_1 })).toEqual({
      error: AUTH_REQUIRED,
    });
  });

  it("returns the updated route row on success", async () => {
    const route = { id: ROUTE_1, set_id: MATCH_1, number: 1 };
    await mockSignedIn({
      "table:routes": { data: route, error: null },
    });
    const { updateMatchRouteAction } = await import("./actions");
    expect(await updateMatchRouteAction({ routeId: ROUTE_1 })).toEqual({ success: true, route });
  });
});

describe("upsertMatchLogAction", () => {
  it("rejects a malformed route id", async () => {
    const { upsertMatchLogAction } = await import("./actions");
    const result = await upsertMatchLogAction({
      matchRouteId: "not-a-uuid",
      attempts: 1,
      completed: true,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid route id" });
  });

  it("rejects a negative attempt count", async () => {
    const { upsertMatchLogAction } = await import("./actions");
    const result = await upsertMatchLogAction({
      matchRouteId: ROUTE_1,
      attempts: -1,
      completed: false,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid attempt count" });
  });

  it("rejects an absurd attempt count", async () => {
    const { upsertMatchLogAction } = await import("./actions");
    const result = await upsertMatchLogAction({
      matchRouteId: ROUTE_1,
      attempts: 1000,
      completed: false,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid attempt count" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { upsertMatchLogAction } = await import("./actions");
    expect(
      await upsertMatchLogAction({
        matchRouteId: ROUTE_1,
        attempts: 1,
        completed: true,
        zone: false,
      }),
    ).toEqual({ error: AUTH_REQUIRED });
  });

  it("returns the offline-queue-compatible success shape", async () => {
    const sb = await mockSignedIn();
    const { upsertMatchLogAction } = await import("./actions");
    const result = await upsertMatchLogAction({
      matchRouteId: ROUTE_1,
      attempts: 2,
      completed: true,
      zone: true,
    });
    // Must match withOfflineQueue's synthetic shape exactly — callers
    // check `"error" in result` identically for both paths.
    expect(result).toEqual({ success: true, log: null });
    const rpc = sb.calls.find((c) => c.source === "upsert_match_log");
    expect(rpc?.args[0]).toEqual({
      p_route_id: ROUTE_1,
      p_attempts: 2,
      p_completed: true,
      p_zone: true,
    });
  });

  it("maps an RPC failure to a friendly error", async () => {
    await mockSignedIn({
      "rpc:upsert_match_log": {
        data: null,
        error: { code: "42501", message: "not a player" },
      },
    });
    const { upsertMatchLogAction } = await import("./actions");
    expect(
      await upsertMatchLogAction({
        matchRouteId: ROUTE_1,
        attempts: 1,
        completed: false,
        zone: false,
      }),
    ).toEqual({ error: "You don't have permission to do that." });
  });
});

describe("endMatchAction", () => {
  it("rejects a malformed match id", async () => {
    const { endMatchAction } = await import("./actions");
    const result = await endMatchAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid match id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { endMatchAction } = await import("./actions");
    expect(await endMatchAction(MATCH_1)).toEqual({ error: AUTH_REQUIRED });
  });

  // The result is addressed by SET id now — there is no summary row
  // to mint an id for. A finished Match is an archived Set, so the id
  // the caller already holds IS the result's address.
  it("returns the set id on success", async () => {
    await mockSignedIn({
      "rpc:end_match": { data: null, error: null },
    });
    const { endMatchAction } = await import("./actions");
    expect(await endMatchAction(MATCH_1)).toEqual({ success: true, summaryId: MATCH_1 });
  });

  it("maps an RPC failure to a friendly error without running housekeeping", async () => {
    await mockSignedIn({
      "rpc:end_match": {
        data: null,
        error: { code: "42501", message: "not a player" },
      },
    });
    const { endMatchAction } = await import("./actions");
    expect(await endMatchAction(MATCH_1)).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});

// ── Invites ─────────────────────────────────────────

const USER_B = "22222222-2222-2222-2222-222222222222";
const USER_C = "33333333-3333-3333-3333-333333333333";
const SET_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** A service client that says the caller is in one live match. */
async function mockServiceWithActiveMatch(
  primed: Parameters<typeof createMockSupabase>[0] = {},
) {
  const service = createMockSupabase({
    "rpc:get_active_match_for_user": {
      data: { set_id: SET_1, code: "ABC123", name: "Tuesday" },
    },
    ...primed,
  });
  const { createServiceClient } = await import("@/lib/supabase/server");
  vi.mocked(createServiceClient).mockReturnValue(service as never);
  return service;
}

describe("inviteToMatch", () => {
  it("rejects a malformed climber id before any auth or DB work", async () => {
    const { inviteToMatch } = await import("./actions");
    expect(await inviteToMatch("not-a-uuid")).toEqual({ error: "Invalid climber id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { inviteToMatch } = await import("./actions");
    expect(await inviteToMatch(USER_B)).toEqual({ error: AUTH_REQUIRED });
  });

  it("is rate limited on the invitesSend bucket", async () => {
    await mockSignedIn();
    const { enforce } = await import("@/lib/rate-limit");
    vi.mocked(enforce).mockResolvedValue({ ok: false, error: "Slow down", retryAfter: 60 });
    const { inviteToMatch } = await import("./actions");
    expect(await inviteToMatch(USER_B)).toEqual({ error: "Slow down" });
    expect(vi.mocked(enforce).mock.calls[0]?.[0]).toBe("invitesSend");
  });

  it("refuses to invite yourself", async () => {
    await mockSignedIn();
    const { inviteToMatch } = await import("./actions");
    expect(await inviteToMatch(USER_A)).toEqual({ error: "That's you." });
  });

  it("needs a live match to invite TO", async () => {
    await mockSignedIn();
    // Default service client: no active match.
    const { inviteToMatch } = await import("./actions");
    expect(await inviteToMatch(USER_B)).toEqual({
      error: "You're not in a live match — start one first.",
    });
    const { notify } = await import("@/lib/notify");
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not invite someone already seated", async () => {
    await mockSignedIn();
    await mockServiceWithActiveMatch({
      "table:set_players": { data: { id: "seat-1" } },
    });
    const { inviteToMatch } = await import("./actions");
    expect(await inviteToMatch(USER_B)).toEqual({ error: "They're already in this match." });
    const { notify } = await import("@/lib/notify");
    expect(notify).not.toHaveBeenCalled();
  });

  it("sends ONE notification carrying the join code, and no seat", async () => {
    await mockSignedIn();
    const service = await mockServiceWithActiveMatch({
      "table:set_players": { data: null },
      "table:profiles": { data: { username: "alice" } },
    });
    const { inviteToMatch } = await import("./actions");
    expect(await inviteToMatch(USER_B)).toEqual({ success: true, matchName: "Tuesday" });

    const { notify } = await import("@/lib/notify");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notify).mock.calls[0]?.[0]).toMatchObject({
      kind: "match_invite_received",
      recipient: USER_B,
      actor: USER_A,
      setId: SET_1,
      code: "ABC123",
      fromUsername: "alice",
    });
    // An invite is a message: nothing is written to the seat table.
    expect(
      service.calls.some((c) => c.source === "set_players" && c.method === "insert"),
    ).toBe(false);
  });
});

describe("getInvitableFriends", () => {
  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { getInvitableFriends } = await import("./actions");
    expect(await getInvitableFriends()).toEqual({ error: AUTH_REQUIRED });
  });

  it("needs a live match", async () => {
    await mockSignedIn();
    const { getInvitableFriends } = await import("./actions");
    expect(await getInvitableFriends()).toEqual({ error: "You're not in a live match." });
  });

  it("lists active friends only, drops the seated, and marks the invited", async () => {
    const friend = (user_id: string, username: string, status: "active" | "pending") => ({
      friend_id: `link-${username}`,
      user_id,
      username,
      name: null,
      avatar_url: null,
      status,
      direction: "sent",
      created_at: "2026-08-01T00:00:00Z",
    });
    await mockSignedIn({
      "rpc:get_friends": {
        data: [
          friend(USER_B, "bea", "active"),
          friend(USER_C, "cal", "active"),
          friend("44444444-4444-4444-4444-444444444444", "dee", "pending"),
        ],
      },
    });
    await mockServiceWithActiveMatch({
      // Cal is already seated; Bea has already been invited.
      "table:set_players": { data: [{ user_id: USER_C }] },
      "table:notifications": { data: [{ user_id: USER_B }] },
    });
    const { getInvitableFriends } = await import("./actions");
    const r = await getInvitableFriends();
    expect(r).toEqual({
      success: true,
      matchName: "Tuesday",
      friends: [
        { user_id: USER_B, username: "bea", name: null, avatar_url: null, invited: true },
      ],
    });
  });

  it("does not hit the seat or notification tables with no friends to check", async () => {
    await mockSignedIn({ "rpc:get_friends": { data: [] } });
    const service = await mockServiceWithActiveMatch();
    const { getInvitableFriends } = await import("./actions");
    expect(await getInvitableFriends()).toEqual({ success: true, friends: [], matchName: "Tuesday" });
    expect(service.calls.some((c) => c.source === "set_players")).toBe(false);
    expect(service.calls.some((c) => c.source === "notifications")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// Guests, ceilings and Chork — the half of the module that had no
// tests until 2026-08-30. The pure Chork module (`lib/data/chork.ts`)
// was tested; the orchestration around the RPCs was not, and that is
// the part that breaks.
// ────────────────────────────────────────────────────────────────

const PLAYER_1 = "dddddddd-dddd-dddd-dddd-dddddddddddd";

describe("addMatchGuestAction", () => {
  it("rejects a malformed match id", async () => {
    const { addMatchGuestAction } = await import("./actions");
    expect(await addMatchGuestAction("nope", "Bea")).toEqual({ error: "Invalid match id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { addMatchGuestAction } = await import("./actions");
    expect(await addMatchGuestAction(MATCH_1, "Bea")).toEqual({ error: AUTH_REQUIRED });
  });

  it("needs a name", async () => {
    await mockSignedIn();
    const { addMatchGuestAction } = await import("./actions");
    expect(await addMatchGuestAction(MATCH_1, "   ")).toEqual({ error: "Give them a name" });
    expect(await addMatchGuestAction(MATCH_1, 42 as never)).toEqual({ error: "Give them a name" });
  });

  it("seats a nameless-account row and returns it", async () => {
    const player = { id: PLAYER_1, set_id: MATCH_1, user_id: null, display_name: "Bea" };
    const sb = await mockSignedIn({ "table:set_players": { data: player } });
    const { addMatchGuestAction } = await import("./actions");
    expect(await addMatchGuestAction(MATCH_1, "  Bea  ")).toEqual({ success: true, player });
    const insert = sb.calls.find((c) => c.source === "set_players" && c.method === "insert");
    expect(insert?.args[0]).toEqual({ set_id: MATCH_1, user_id: null, display_name: "Bea" });
  });

  it("clamps the name to 40 characters", async () => {
    const sb = await mockSignedIn({ "table:set_players": { data: { id: PLAYER_1 } } });
    const { addMatchGuestAction } = await import("./actions");
    await addMatchGuestAction(MATCH_1, "x".repeat(80));
    const insert = sb.calls.find((c) => c.source === "set_players" && c.method === "insert");
    expect((insert?.args[0] as { display_name: string }).display_name).toHaveLength(40);
  });

  it("reads an RLS-filtered insert as 'not the host'", async () => {
    // No RPC: `set_players_insert` permits exactly the host of a live
    // Match seating a guest, and RLS filtering the row out is what a
    // non-host gets.
    await mockSignedIn({ "table:set_players": { data: null } });
    const { addMatchGuestAction } = await import("./actions");
    expect(await addMatchGuestAction(MATCH_1, "Bea")).toEqual({
      error: "Only the host can add a guest.",
    });
  });
});

describe("removeMatchGuestAction", () => {
  it("rejects a malformed player id", async () => {
    const { removeMatchGuestAction } = await import("./actions");
    expect(await removeMatchGuestAction("nope")).toEqual({ error: "Invalid player id" });
  });

  it("parks the seat rather than deleting it, and only a guest's", async () => {
    const sb = await mockSignedIn();
    const { removeMatchGuestAction } = await import("./actions");
    expect(await removeMatchGuestAction(PLAYER_1)).toEqual({ success: true });
    const calls = sb.calls.filter((c) => c.source === "set_players");
    expect(calls.some((c) => c.method === "delete")).toBe(false);
    const update = calls.find((c) => c.method === "update");
    expect(update?.args[0]).toHaveProperty("left_at", expect.any(String));
    // Scoped to a guest seat that is still seated — an account-backed
    // player leaves through leaveMatchAction, never through the host.
    expect(calls.filter((c) => c.method === "is").map((c) => c.args)).toEqual([
      ["user_id", null],
      ["left_at", null],
    ]);
  });
});

describe("setMatchCeilingAction", () => {
  it("rejects a malformed player id, then a malformed match id", async () => {
    await mockSignedIn();
    const { setMatchCeilingAction } = await import("./actions");
    expect(await setMatchCeilingAction(MATCH_1, "nope", 5)).toEqual({ error: "Invalid player id" });
    expect(await setMatchCeilingAction("nope", PLAYER_1, 5)).toEqual({ error: "Invalid match id" });
  });

  it.each([-1, 31, 2.5, Number.NaN])("rejects a ceiling of %s", async (ceiling) => {
    await mockSignedIn();
    const { setMatchCeilingAction } = await import("./actions");
    expect(await setMatchCeilingAction(MATCH_1, PLAYER_1, ceiling)).toEqual({
      error: "Ceiling out of range",
    });
    // The other family's limit on a mixed day is held to the same range.
    expect(await setMatchCeilingAction(MATCH_1, PLAYER_1, 5, ceiling)).toEqual({
      error: "Ceiling out of range",
    });
  });

  it("folds a cleared ceiling to undefined at the RPC boundary", async () => {
    const sb = await mockSignedIn();
    const { setMatchCeilingAction } = await import("./actions");
    expect(await setMatchCeilingAction(MATCH_1, PLAYER_1, null)).toEqual({ success: true });
    const rpc = sb.calls.find((c) => c.source === "set_match_ceiling");
    expect(rpc?.args[0]).toEqual({
      p_set_id: MATCH_1,
      p_player_id: PLAYER_1,
      p_ceiling: undefined,
      p_alt_ceiling: undefined,
    });
  });

  it("sends both ceilings on a mixed day", async () => {
    const sb = await mockSignedIn();
    const { setMatchCeilingAction } = await import("./actions");
    await setMatchCeilingAction(MATCH_1, PLAYER_1, 6, 12);
    const rpc = sb.calls.find((c) => c.source === "set_match_ceiling");
    expect(rpc?.args[0]).toMatchObject({ p_ceiling: 6, p_alt_ceiling: 12 });
  });

  it("maps an RPC refusal (not your seat) to a friendly error", async () => {
    await mockSignedIn({
      "rpc:set_match_ceiling": { error: { code: "42501", message: "permission denied" } },
    });
    const { setMatchCeilingAction } = await import("./actions");
    const result = await setMatchCeilingAction(MATCH_1, PLAYER_1, 6);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).not.toContain("permission denied");
  });
});

describe("fetchChorkAllowance", () => {
  it("rejects malformed ids in order: match, route, player", async () => {
    await mockSignedIn();
    const { fetchChorkAllowance } = await import("./actions");
    expect(await fetchChorkAllowance("nope", ROUTE_1)).toEqual({ error: "Invalid match id" });
    expect(await fetchChorkAllowance(MATCH_1, "nope")).toEqual({ error: "Invalid route id" });
    expect(await fetchChorkAllowance(MATCH_1, ROUTE_1, "nope")).toEqual({ error: "Invalid player id" });
  });

  it("is a read: no rate limit, even though it goes through the gate", async () => {
    await mockSignedIn({ "rpc:chork_round_allowance": { data: 3 } });
    const { fetchChorkAllowance } = await import("./actions");
    expect(await fetchChorkAllowance(MATCH_1, ROUTE_1)).toEqual({ success: true, allowance: 3 });
    const { enforce } = await import("@/lib/rate-limit");
    expect(enforce).not.toHaveBeenCalled();
  });

  it("returns null when the setter hasn't sent their own challenge yet", async () => {
    const sb = await mockSignedIn({ "rpc:chork_round_allowance": { data: null } });
    const { fetchChorkAllowance } = await import("./actions");
    expect(await fetchChorkAllowance(MATCH_1, ROUTE_1, PLAYER_1)).toEqual({
      success: true,
      allowance: null,
    });
    expect(sb.calls.find((c) => c.source === "chork_round_allowance")?.args[0]).toEqual({
      p_set_id: MATCH_1,
      p_route_id: ROUTE_1,
      p_player_id: PLAYER_1,
    });
  });
});

describe("concedeChorkRound", () => {
  it("rejects malformed ids", async () => {
    await mockSignedIn();
    const { concedeChorkRound } = await import("./actions");
    expect(await concedeChorkRound("nope", ROUTE_1)).toEqual({ error: "Invalid match id" });
    expect(await concedeChorkRound(MATCH_1, "nope")).toEqual({ error: "Invalid route id" });
    expect(await concedeChorkRound(MATCH_1, ROUTE_1, "nope")).toEqual({ error: "Invalid player id" });
  });

  it("is a write: rate limited on the mutationsWrite bucket", async () => {
    await mockSignedIn();
    const { enforce } = await import("@/lib/rate-limit");
    vi.mocked(enforce).mockResolvedValue({ ok: false, error: "Slow down", retryAfter: 60 });
    const { concedeChorkRound } = await import("./actions");
    expect(await concedeChorkRound(MATCH_1, ROUTE_1)).toEqual({ error: "Slow down" });
    expect(vi.mocked(enforce).mock.calls[0]?.[0]).toBe("mutationsWrite");
  });

  it("concedes your own round, or a guest's if you host", async () => {
    const sb = await mockSignedIn();
    const { concedeChorkRound } = await import("./actions");
    expect(await concedeChorkRound(MATCH_1, ROUTE_1)).toEqual({ success: true });
    expect(sb.calls.find((c) => c.source === "chork_concede")?.args[0]).toEqual({
      p_set_id: MATCH_1,
      p_route_id: ROUTE_1,
      p_player_id: undefined,
    });
    await concedeChorkRound(MATCH_1, ROUTE_1, PLAYER_1);
    expect(sb.calls.filter((c) => c.source === "chork_concede")[1]?.args[0]).toMatchObject({
      p_player_id: PLAYER_1,
    });
  });
});

describe("withdrawChorkRoute", () => {
  it("rejects malformed ids", async () => {
    await mockSignedIn();
    const { withdrawChorkRoute } = await import("./actions");
    expect(await withdrawChorkRoute("nope", ROUTE_1)).toEqual({ error: "Invalid match id" });
    expect(await withdrawChorkRoute(MATCH_1, "nope")).toEqual({ error: "Invalid route id" });
    expect(await withdrawChorkRoute(MATCH_1, ROUTE_1, "nope")).toEqual({ error: "Invalid player id" });
  });

  it("withdraws through the RPC, folding an absent player to undefined", async () => {
    const sb = await mockSignedIn();
    const { withdrawChorkRoute } = await import("./actions");
    expect(await withdrawChorkRoute(MATCH_1, ROUTE_1, null)).toEqual({ success: true });
    expect(sb.calls.find((c) => c.source === "chork_withdraw_route")?.args[0]).toEqual({
      p_route_id: ROUTE_1,
      p_player_id: undefined,
    });
  });

  it("surfaces the RPC's refusal once the setter has sent it", async () => {
    // Other climbers may already have spent goes answering; the SQL
    // refuses, and the message is theirs to show.
    await mockSignedIn({
      "rpc:chork_withdraw_route": {
        error: { code: "P0001", message: "Can't withdraw a challenge you've sent" },
      },
    });
    const { withdrawChorkRoute } = await import("./actions");
    expect(await withdrawChorkRoute(MATCH_1, ROUTE_1)).toEqual({
      error: "Can't withdraw a challenge you've sent",
    });
  });
});

describe("fetchChorkStandings", () => {
  it("rejects a malformed match id and surfaces auth failure", async () => {
    const { fetchChorkStandings } = await import("./actions");
    expect(await fetchChorkStandings("nope")).toEqual({ error: "Invalid match id" });
    await mockAuthFailure();
    expect(await fetchChorkStandings(MATCH_1)).toEqual({ error: AUTH_REQUIRED });
  });

  it("is a read: not rate limited", async () => {
    await mockSignedIn({ "rpc:chork_standings": { data: [] } });
    const { fetchChorkStandings } = await import("./actions");
    expect(await fetchChorkStandings(MATCH_1)).toEqual({ success: true, standings: [] });
    const { enforce } = await import("@/lib/rate-limit");
    expect(enforce).not.toHaveBeenCalled();
  });

  it("passes every seat field through — names included, attempts never", async () => {
    // The action used to declare a five-field copy of this row and
    // the live board lost the names the RPC was already sending.
    const standing = {
      player_id: PLAYER_1,
      user_id: USER_B,
      username: "bea",
      display_name: "Bea",
      avatar_url: null,
      is_guest: false,
      letters: 2,
      is_out: false,
      has_left: false,
      has_pen: true,
    };
    await mockSignedIn({ "rpc:chork_standings": { data: [standing] } });
    const { fetchChorkStandings } = await import("./actions");
    const result = await fetchChorkStandings(MATCH_1);
    expect(result).toEqual({ success: true, standings: [standing] });
    expect(JSON.stringify(result)).not.toMatch(/attempts/);
  });
});

describe("setMatchGameMode / setMatchHandicapAction", () => {
  it("rejects a game mode the union didn't promise", async () => {
    await mockSignedIn();
    const { setMatchGameMode } = await import("./actions");
    expect(await setMatchGameMode(MATCH_1, "horse" as never)).toEqual({ error: "Invalid game mode" });
  });

  it("switches the mode through the RPC", async () => {
    const sb = await mockSignedIn();
    const { setMatchGameMode } = await import("./actions");
    expect(await setMatchGameMode(MATCH_1, "chork")).toEqual({ success: true });
    expect(sb.calls.find((c) => c.source === "set_match_game_mode")?.args[0]).toEqual({
      p_set_id: MATCH_1,
      p_mode: "chork",
    });
  });

  it("rejects a non-boolean handicap flag", async () => {
    await mockSignedIn();
    const { setMatchHandicapAction } = await import("./actions");
    expect(await setMatchHandicapAction(MATCH_1, "yes" as never)).toEqual({ error: "Invalid value" });
  });

  it("toggles the handicap through the RPC", async () => {
    const sb = await mockSignedIn();
    const { setMatchHandicapAction } = await import("./actions");
    expect(await setMatchHandicapAction(MATCH_1, true)).toEqual({ success: true });
    expect(sb.calls.find((c) => c.source === "set_match_handicap")?.args[0]).toEqual({
      p_set_id: MATCH_1,
      p_enabled: true,
    });
  });

  it("maps a host-only refusal to a friendly error", async () => {
    await mockSignedIn({
      "rpc:set_match_game_mode": { error: { code: "42501", message: "permission denied for function" } },
    });
    const { setMatchGameMode } = await import("./actions");
    const result = await setMatchGameMode(MATCH_1, "points");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).not.toContain("permission denied");
  });
});

describe("shareResultAction", () => {
  it("rejects a malformed result id", async () => {
    const { shareResultAction } = await import("./actions");
    expect(await shareResultAction("nope")).toEqual({ error: "Invalid result" });
  });

  it("collapses not-found and not-a-participant into one answer", async () => {
    await mockSignedIn();
    await mockServiceWithActiveMatch({ "rpc:get_match_state_for_user": { data: null } });
    const { shareResultAction } = await import("./actions");
    expect(await shareResultAction(MATCH_1)).toEqual({ error: "Result not found." });
  });

  it("returns the canonical share URL for a result the caller played", async () => {
    await mockSignedIn();
    await mockServiceWithActiveMatch({
      "rpc:get_match_state_for_user": { data: { match: { id: MATCH_1 } } },
      // An existing token is reused — sharing twice yields one link.
      "table:sets": { data: { share_token: "tok-abc" } },
    });
    const { shareResultAction } = await import("./actions");
    const result = await shareResultAction(MATCH_1);
    expect(result).toMatchObject({ success: true });
    expect((result as { url: string }).url).toMatch(/\/r\/tok-abc$/);
  });

  it("fails cleanly when a token cannot be minted", async () => {
    await mockSignedIn();
    await mockServiceWithActiveMatch({
      "rpc:get_match_state_for_user": { data: { match: { id: MATCH_1 } } },
      "table:sets": [
        { data: { share_token: null } },
        { error: { code: "42501", message: "denied" } },
      ],
    });
    const { shareResultAction } = await import("./actions");
    expect(await shareResultAction(MATCH_1)).toEqual({
      error: "Couldn't create a share link — try again.",
    });
  });
});
