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
    expect(result).toEqual({ id: MATCH_1, code: "ABCDEF" });

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
    expect(result).toEqual({ id: MATCH_1, code: "ABCDEF" });
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
    expect(await joinMatchAction(MATCH_1)).toEqual({ ok: true });
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
    expect(await leaveMatchAction(MATCH_1)).toEqual({ ok: true });
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
    expect(await addMatchRouteAction({ matchId: MATCH_1 })).toEqual({ route });
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
    expect(await updateMatchRouteAction({ routeId: ROUTE_1 })).toEqual({ route });
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
    expect(await endMatchAction(MATCH_1)).toEqual({ summaryId: MATCH_1 });
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
