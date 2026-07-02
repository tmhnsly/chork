import { describe, it, expect, vi, beforeEach } from "vitest";

// ────────────────────────────────────────────────────────────────
// Module mocks
// ────────────────────────────────────────────────────────────────
// The mutations layer (`upsertRouteLog`, `createActivityEvent`,
// `deleteCompletionEvents`) is deliberately left REAL — these tests
// drive it through a thenable Supabase proxy so the invariants below
// ("a successful complete writes BOTH the log and the activity event")
// are asserted at the table level, not against a mocked helper that
// could drift from the real write path.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/cache/revalidate", () => ({
  revalidateRouteLogTags: vi.fn(),
  revalidateUserProfile: vi.fn(),
}));
// deleteCompletionEvents builds its own service-role client — return
// the per-test proxy so the delete lands in the recorded call log.
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/achievements/context", () => ({ buildBadgeContext: vi.fn() }));
vi.mock("@/lib/achievements/evaluate", () => ({
  evaluateAndPersistAchievements: vi.fn(),
}));
vi.mock("@/lib/auth", () => {
  const requireAuth = vi.fn();
  // gateClimberMutation in production: UUID gate + requireAuth + rate
  // limit. The mock forwards UUID failure inline and delegates the
  // auth outcome to the requireAuth mock (same pattern as
  // src/app/(app)/actions.test.ts) so per-test setups just prime
  // requireAuth. Rate limiting is covered by lib/rate-limit's tests.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const gateClimberMutation = vi.fn(async (id: string, label: string) => {
    if (!UUID_RE.test(id)) return { error: `Invalid ${label}` };
    return await requireAuth();
  });
  return { requireAuth, gateClimberMutation };
});

// ────────────────────────────────────────────────────────────────
// Supabase client mock — thenable chain proxy with call recording
// ────────────────────────────────────────────────────────────────
// Same shape as src/app/crew/actions.test.ts, extended to record every
// chained call (table + method + args) so tests can assert WHICH
// tables were written and with what payload. Postgres error fixtures
// carry a `code` field — `formatError` branches on it, so a bare
// `message` string would silently skip the friendly mapping.

type SbError = { code?: string; message?: string; details?: string; hint?: string };
type SbResult = { data?: unknown; error?: SbError | null };
type RecordedCall = { table: string; method: string; args: unknown[] };

function makeChain(
  table: string,
  resolve: () => SbResult,
  calls: RecordedCall[],
) {
  const builder: Record<string, unknown> = {};
  const methods = [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "in", "or", "order", "limit",
    "maybeSingle", "single",
  ];
  for (const m of methods) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ table, method: m, args });
      return builder;
    };
  }
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

function mockSupabase(results: Record<string, SbResult> = {}) {
  const calls: RecordedCall[] = [];
  const client = {
    from: (table: string) =>
      makeChain(table, () => results[`table:${table}`] ?? { data: null, error: null }, calls),
  };
  return { client, calls };
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const GYM_1 = "22222222-2222-4222-8222-222222222222";
const ROUTE_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOG_1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SET_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** A realistic route_logs row as returned by the upsert's
 *  `select("*, routes!inner(set_id)")` — the embed is what lets the
 *  action bust the right set leaderboard without a second query. */
function logRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LOG_1,
    user_id: USER_A,
    route_id: ROUTE_1,
    gym_id: GYM_1,
    attempts: 2,
    completed: true,
    completed_at: "2026-07-01T00:00:00.000Z",
    grade_vote: null,
    zone: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    routes: { set_id: SET_1 },
    ...overrides,
  };
}

async function primeAuth(supabase: unknown) {
  const { requireAuth } = await import("@/lib/auth");
  vi.mocked(requireAuth).mockResolvedValue({
    supabase: supabase as never,
    userId: USER_A,
    gymId: GYM_1,
  } as never);
}

beforeEach(async () => {
  vi.resetAllMocks();
  // Default: no badge context → badge evaluation short-circuits and
  // the result carries no earnedBadges. Badge-specific tests override.
  const { buildBadgeContext } = await import("@/lib/achievements/context");
  vi.mocked(buildBadgeContext).mockResolvedValue(null as never);
});

// ────────────────────────────────────────────────────────────────
// completeRoute
// ────────────────────────────────────────────────────────────────
describe("completeRoute", () => {
  it("rejects a malformed routeId at the boundary", async () => {
    const { completeRoute } = await import("./route-log-actions");
    const result = await completeRoute("not-a-uuid", 1, null, false);
    expect(result).toEqual({ error: "Invalid route" });
  });

  it("rejects a malformed logId before any auth or DB call", async () => {
    const { completeRoute } = await import("./route-log-actions");
    const { gateClimberMutation } = await import("@/lib/auth");
    const result = await completeRoute(ROUTE_1, 1, null, false, "not-a-uuid");
    expect(result).toEqual({ error: "Invalid log" });
    expect(gateClimberMutation).not.toHaveBeenCalled();
  });

  it("rejects out-of-range attempts (0, 1000, non-integer)", async () => {
    const { completeRoute } = await import("./route-log-actions");
    expect(await completeRoute(ROUTE_1, 0, null, false)).toEqual({ error: "Invalid attempts" });
    expect(await completeRoute(ROUTE_1, 1000, null, false)).toEqual({ error: "Invalid attempts" });
    expect(await completeRoute(ROUTE_1, 1.5, null, false)).toEqual({ error: "Invalid attempts" });
  });

  it("rejects an out-of-range grade vote before any DB call", async () => {
    const { completeRoute } = await import("./route-log-actions");
    const { gateClimberMutation } = await import("@/lib/auth");
    // 31 exceeds the 0..30 window (migration 014); fractions invalid.
    expect(await completeRoute(ROUTE_1, 2, 31, false)).toEqual({ error: "Invalid grade" });
    expect(await completeRoute(ROUTE_1, 2, -1, false)).toEqual({ error: "Invalid grade" });
    expect(await completeRoute(ROUTE_1, 2, 2.5, false)).toEqual({ error: "Invalid grade" });
    expect(gateClimberMutation).not.toHaveBeenCalled();
  });

  it("propagates auth failure as a clean { error }", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" } as never);
    const { completeRoute } = await import("./route-log-actions");
    const result = await completeRoute(ROUTE_1, 2, null, false);
    expect(result).toEqual({ error: "Not signed in" });
  });

  it("writes BOTH the route log and the activity event, and busts the route-log tags", async () => {
    const { client, calls } = mockSupabase({
      "table:route_logs": { data: logRow(), error: null },
      "table:activity_events": {
        data: { id: "evt1", user_id: USER_A, route_id: ROUTE_1, type: "completed", gym_id: GYM_1 },
        error: null,
      },
    });
    await primeAuth(client);

    const { completeRoute } = await import("./route-log-actions");
    const { revalidateRouteLogTags } = await import("@/lib/cache/revalidate");
    const result = await completeRoute(ROUTE_1, 2, null, false);

    expect(result).toMatchObject({ success: true, log: expect.objectContaining({ id: LOG_1 }) });
    // The joined routes embed is flattened to a top-level set_id.
    expect((result as { log: { set_id: string } }).log.set_id).toBe(SET_1);

    // Invariant: a send is TWO writes — the log row and the feed event.
    expect(calls.some((c) => c.table === "route_logs" && c.method === "upsert")).toBe(true);
    expect(calls.some((c) => c.table === "activity_events" && c.method === "insert")).toBe(true);

    // Invariant: leaderboard + user-stats tags bust together via the
    // shared helper — forgetting either leaves 60s of stale UI.
    expect(revalidateRouteLogTags).toHaveBeenCalledWith(SET_1, USER_A);
  });

  it("derives flash (attempts=1 + completed) into the activity event type", async () => {
    const { client, calls } = mockSupabase({
      "table:route_logs": { data: logRow({ attempts: 1 }), error: null },
      "table:activity_events": { data: { id: "evt1" }, error: null },
    });
    await primeAuth(client);

    const { completeRoute } = await import("./route-log-actions");
    await completeRoute(ROUTE_1, 1, null, false);

    const insert = calls.find((c) => c.table === "activity_events" && c.method === "insert");
    expect(insert?.args[0]).toMatchObject({ type: "flashed", user_id: USER_A, route_id: ROUTE_1, gym_id: GYM_1 });
  });

  it("logs a plain 'completed' event for 2+ attempts (flash is derived, never stored)", async () => {
    const { client, calls } = mockSupabase({
      "table:route_logs": { data: logRow({ attempts: 3 }), error: null },
      "table:activity_events": { data: { id: "evt1" }, error: null },
    });
    await primeAuth(client);

    const { completeRoute } = await import("./route-log-actions");
    await completeRoute(ROUTE_1, 3, null, false);

    const insert = calls.find((c) => c.table === "activity_events" && c.method === "insert");
    expect(insert?.args[0]).toMatchObject({ type: "completed" });
  });

  it("maps a 42501 RLS rejection on the log write to the friendly permission message", async () => {
    const { client } = mockSupabase({
      "table:route_logs": {
        data: null,
        error: { code: "42501", message: "new row violates row-level security policy" },
      },
      "table:activity_events": { data: { id: "evt1" }, error: null },
    });
    await primeAuth(client);

    const { completeRoute } = await import("./route-log-actions");
    const result = await completeRoute(ROUTE_1, 2, null, false);
    expect(result).toEqual({ error: "You don't have permission to do that." });
  });

  it("maps a 23503 FK violation on the activity-event write to the friendly message", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: logRow(), error: null },
      "table:activity_events": {
        data: null,
        error: { code: "23503", message: "insert violates foreign key constraint" },
      },
    });
    await primeAuth(client);

    const { completeRoute } = await import("./route-log-actions");
    const result = await completeRoute(ROUTE_1, 2, null, false);
    expect(result).toEqual({ error: "Referenced record was not found." });
  });

  it("carries newly-earned badges on the result when evaluation returns some", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: logRow(), error: null },
      "table:activity_events": { data: { id: "evt1" }, error: null },
    });
    await primeAuth(client);
    const { buildBadgeContext } = await import("@/lib/achievements/context");
    const { evaluateAndPersistAchievements } = await import("@/lib/achievements/evaluate");
    vi.mocked(buildBadgeContext).mockResolvedValue({} as never);
    const badge = { id: "first-send", name: "First Send" };
    vi.mocked(evaluateAndPersistAchievements).mockResolvedValue([badge] as never);

    const { completeRoute } = await import("./route-log-actions");
    const result = await completeRoute(ROUTE_1, 2, null, false);
    expect(result).toMatchObject({ success: true, earnedBadges: [badge] });
  });

  it("omits earnedBadges entirely when nothing new was earned", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: logRow(), error: null },
      "table:activity_events": { data: { id: "evt1" }, error: null },
    });
    await primeAuth(client);
    const { buildBadgeContext } = await import("@/lib/achievements/context");
    const { evaluateAndPersistAchievements } = await import("@/lib/achievements/evaluate");
    vi.mocked(buildBadgeContext).mockResolvedValue({} as never);
    vi.mocked(evaluateAndPersistAchievements).mockResolvedValue([] as never);

    const { completeRoute } = await import("./route-log-actions");
    const result = await completeRoute(ROUTE_1, 2, null, false);
    expect(result).toEqual({ success: true, log: expect.anything() });
    expect("earnedBadges" in result).toBe(false);
  });

  it("still returns success when badge evaluation blows up (side-effect isolation)", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: logRow(), error: null },
      "table:activity_events": { data: { id: "evt1" }, error: null },
    });
    await primeAuth(client);
    const { buildBadgeContext } = await import("@/lib/achievements/context");
    vi.mocked(buildBadgeContext).mockRejectedValue(new Error("badge context boom"));
    // The action catches + logs; silence the expected console.error.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { completeRoute } = await import("./route-log-actions");
    const result = await completeRoute(ROUTE_1, 2, null, false);
    expect(result).toMatchObject({ success: true });
    expect("earnedBadges" in result).toBe(false);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ────────────────────────────────────────────────────────────────
// updateAttempts
// ────────────────────────────────────────────────────────────────
describe("updateAttempts", () => {
  it("rejects a malformed logId before any auth or DB call", async () => {
    const { updateAttempts } = await import("./route-log-actions");
    const { gateClimberMutation } = await import("@/lib/auth");
    expect(await updateAttempts(ROUTE_1, 2, "nope")).toEqual({ error: "Invalid log" });
    expect(gateClimberMutation).not.toHaveBeenCalled();
  });

  it("rejects out-of-range attempts (-1, 1000, non-integer)", async () => {
    const { updateAttempts } = await import("./route-log-actions");
    expect(await updateAttempts(ROUTE_1, -1)).toEqual({ error: "Invalid attempts" });
    expect(await updateAttempts(ROUTE_1, 1000)).toEqual({ error: "Invalid attempts" });
    expect(await updateAttempts(ROUTE_1, 2.5)).toEqual({ error: "Invalid attempts" });
  });

  it("propagates auth failure", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" } as never);
    const { updateAttempts } = await import("./route-log-actions");
    expect(await updateAttempts(ROUTE_1, 2)).toEqual({ error: "Not signed in" });
  });

  it("returns the updated log WITHOUT busting route-log tags (optimistic UI owns attempts)", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: logRow({ completed: false, attempts: 4 }), error: null },
    });
    await primeAuth(client);

    const { updateAttempts } = await import("./route-log-actions");
    const { revalidateRouteLogTags } = await import("@/lib/cache/revalidate");
    const result = await updateAttempts(ROUTE_1, 4, LOG_1);
    expect(result).toMatchObject({ success: true, log: expect.objectContaining({ attempts: 4 }) });
    // Attempts are high-frequency writes; the action deliberately
    // skips revalidation. Pin it so a refactor doesn't start
    // scorching the leaderboard cache on every +1 tap.
    expect(revalidateRouteLogTags).not.toHaveBeenCalled();
  });

  it("maps a DB error through formatError", async () => {
    const { client } = mockSupabase({
      "table:route_logs": {
        data: null,
        error: { code: "23514", message: "check constraint violated" },
      },
    });
    await primeAuth(client);
    const { updateAttempts } = await import("./route-log-actions");
    expect(await updateAttempts(ROUTE_1, 4, LOG_1)).toEqual({ error: "That value isn't allowed." });
  });
});

// ────────────────────────────────────────────────────────────────
// uncompleteRoute
// ────────────────────────────────────────────────────────────────
describe("uncompleteRoute", () => {
  it("rejects a malformed logId", async () => {
    const { uncompleteRoute } = await import("./route-log-actions");
    expect(await uncompleteRoute(ROUTE_1, "bad")).toEqual({ error: "Invalid log" });
  });

  it("propagates auth failure", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" } as never);
    const { uncompleteRoute } = await import("./route-log-actions");
    expect(await uncompleteRoute(ROUTE_1)).toEqual({ error: "Not signed in" });
  });

  it("clears the log, deletes completion events, and busts the tags", async () => {
    const { client, calls } = mockSupabase({
      "table:route_logs": {
        data: logRow({ completed: false, completed_at: null, grade_vote: null }),
        error: null,
      },
    });
    // deleteCompletionEvents goes through the service-role client —
    // hand it a second recording proxy.
    const service = mockSupabase({ "table:activity_events": { data: null, error: null } });
    const { createServiceClient } = await import("@/lib/supabase/server");
    vi.mocked(createServiceClient).mockReturnValue(service.client as never);
    await primeAuth(client);

    const { uncompleteRoute } = await import("./route-log-actions");
    const { revalidateRouteLogTags } = await import("@/lib/cache/revalidate");
    const result = await uncompleteRoute(ROUTE_1, LOG_1);

    expect(result).toMatchObject({ success: true });
    expect(calls.some((c) => c.table === "route_logs" && c.method === "update")).toBe(true);
    expect(service.calls.some((c) => c.table === "activity_events" && c.method === "delete")).toBe(true);
    expect(revalidateRouteLogTags).toHaveBeenCalledWith(SET_1, USER_A);
  });

  it("maps a 42501 on the update to the friendly permission message", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: null, error: { code: "42501", message: "RLS" } },
    });
    const service = mockSupabase({ "table:activity_events": { data: null, error: null } });
    const { createServiceClient } = await import("@/lib/supabase/server");
    vi.mocked(createServiceClient).mockReturnValue(service.client as never);
    await primeAuth(client);

    const { uncompleteRoute } = await import("./route-log-actions");
    expect(await uncompleteRoute(ROUTE_1, LOG_1)).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});

// ────────────────────────────────────────────────────────────────
// toggleZone
// ────────────────────────────────────────────────────────────────
describe("toggleZone", () => {
  it("rejects a malformed logId", async () => {
    const { toggleZone } = await import("./route-log-actions");
    expect(await toggleZone(ROUTE_1, true, "bad")).toEqual({ error: "Invalid log" });
  });

  it("propagates auth failure", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" } as never);
    const { toggleZone } = await import("./route-log-actions");
    expect(await toggleZone(ROUTE_1, true)).toEqual({ error: "Not signed in" });
  });

  it("returns the updated log on success", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: logRow({ zone: true, completed: false }), error: null },
    });
    await primeAuth(client);
    const { toggleZone } = await import("./route-log-actions");
    const result = await toggleZone(ROUTE_1, true, LOG_1);
    expect(result).toMatchObject({ success: true, log: expect.objectContaining({ zone: true }) });
  });
});

// ────────────────────────────────────────────────────────────────
// updateGradeVote
// ────────────────────────────────────────────────────────────────
describe("updateGradeVote", () => {
  it("rejects a malformed logId (required here — votes only exist on a log)", async () => {
    const { updateGradeVote } = await import("./route-log-actions");
    expect(await updateGradeVote(ROUTE_1, 5, "bad")).toEqual({ error: "Invalid log" });
  });

  it("rejects an out-of-range grade vote", async () => {
    const { updateGradeVote } = await import("./route-log-actions");
    expect(await updateGradeVote(ROUTE_1, 31, LOG_1)).toEqual({ error: "Invalid grade" });
    expect(await updateGradeVote(ROUTE_1, -1, LOG_1)).toEqual({ error: "Invalid grade" });
  });

  it("writes the vote and busts the per-route grade tag", async () => {
    const { client, calls } = mockSupabase({
      "table:route_logs": { data: logRow({ grade_vote: 5 }), error: null },
    });
    await primeAuth(client);

    const { updateGradeVote } = await import("./route-log-actions");
    const { revalidateTag } = await import("next/cache");
    const result = await updateGradeVote(ROUTE_1, 5, LOG_1);

    expect(result).toMatchObject({ success: true, log: expect.objectContaining({ grade_vote: 5 }) });
    expect(calls.some((c) => c.table === "route_logs" && c.method === "update")).toBe(true);
    const bustedTags = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);
    expect(bustedTags).toContain(`route:${ROUTE_1}:grade`);
  });

  it("accepts null to clear a vote", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: logRow({ grade_vote: null }), error: null },
    });
    await primeAuth(client);
    const { updateGradeVote } = await import("./route-log-actions");
    expect(await updateGradeVote(ROUTE_1, null, LOG_1)).toMatchObject({ success: true });
  });

  it("maps a DB error through formatError", async () => {
    const { client } = mockSupabase({
      "table:route_logs": { data: null, error: { code: "PGRST116", message: "0 rows" } },
    });
    await primeAuth(client);
    const { updateGradeVote } = await import("./route-log-actions");
    expect(await updateGradeVote(ROUTE_1, 5, LOG_1)).toEqual({ error: "Not found." });
  });
});
