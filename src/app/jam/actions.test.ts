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
const JAM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ROUTE_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const AUTH_REQUIRED = "You need to be signed in to do that";

beforeEach(async () => {
  vi.resetAllMocks();
  // endJamAction's deferred housekeeping reads jam_summary_players via
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

describe("createJamAction", () => {
  it("rejects an invalid grading scale", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      name: null,
      location: null,
      gradingScale: "nope" as never,
    });
    expect(result).toEqual({ error: "Invalid grading scale" });
  });

  it("requires a min + max grade for V-scale", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "v",
    });
    expect(result).toEqual({ error: expect.stringContaining("min and max") });
  });

  it("rejects a min grade out of range", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "v",
      minGrade: -1,
      maxGrade: 5,
    });
    expect(result).toEqual({ error: expect.stringContaining("Min grade") });
  });

  it("rejects a max grade below the min", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "v",
      minGrade: 5,
      maxGrade: 3,
    });
    expect(result).toEqual({ error: expect.stringContaining("Max grade") });
  });

  it("rejects a custom scale with no grades", async () => {
    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "custom",
      customGrades: [],
    });
    expect(result).toEqual({ error: expect.stringContaining("at least one") });
  });

  it("rejects a custom scale with more than 50 grades", async () => {
    const { createJamAction } = await import("./actions");
    const tooMany = Array.from({ length: 51 }, (_, i) => `g${i}`);
    const result = await createJamAction({
      gradingScale: "custom",
      customGrades: tooMany,
    });
    expect(result).toEqual({ error: expect.stringContaining("Max 50") });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { createJamAction } = await import("./actions");
    expect(await createJamAction({ gradingScale: "points" })).toEqual({
      error: AUTH_REQUIRED,
    });
  });

  it("accepts a points-scale jam without grades", async () => {
    // Regression: points jams used to fall into the custom-grades
    // branch and always return "Add at least one custom grade".
    const sb = await mockSignedIn({
      "rpc:create_jam": { data: [{ id: JAM_1, code: "ABCDEF" }], error: null },
    });

    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "points",
    });
    expect(result).toEqual({ id: JAM_1, code: "ABCDEF" });

    const rpc = sb.calls.find((c) => c.source === "create_jam");
    expect(rpc?.args[0]).toEqual(
      expect.objectContaining({
        p_grading_scale: "points",
        p_custom_grades: undefined,
        p_min_grade: undefined,
        p_max_grade: undefined,
      }),
    );
  });

  it("accepts a V-scale jam with valid bounds", async () => {
    await mockSignedIn({
      "rpc:create_jam": { data: [{ id: JAM_1, code: "ABCDEF" }], error: null },
    });

    const { createJamAction } = await import("./actions");
    const result = await createJamAction({
      gradingScale: "v",
      minGrade: 0,
      maxGrade: 5,
    });
    expect(result).toEqual({ id: JAM_1, code: "ABCDEF" });
  });

  it("maps an RPC failure to a friendly error", async () => {
    await mockSignedIn({
      "rpc:create_jam": {
        data: null,
        error: { code: "42501", message: "rls denies" },
      },
    });
    const { createJamAction } = await import("./actions");
    expect(await createJamAction({ gradingScale: "points" })).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});

describe("jam write rate limiting", () => {
  // All seven jam writes shipped with NO rate limit while every other
  // mutation tier had one — pinned here so the gate can't quietly be
  // dropped again. gateSignedInMutation defaults the limit ON.
  it("createJamAction surfaces the rate-limit error when the bucket trips", async () => {
    await mockSignedIn();
    const { enforce } = await import("@/lib/rate-limit");
    vi.mocked(enforce).mockResolvedValueOnce({
      ok: false,
      error: "Too many requests. Try again in 42s.",
      retryAfter: 42,
    });
    const { createJamAction } = await import("./actions");
    expect(await createJamAction({ gradingScale: "points" })).toEqual({
      error: "Too many requests. Try again in 42s.",
    });
  });

  it("upsertJamLogAction enforces the mutationsWrite bucket", async () => {
    await mockSignedIn();
    const { enforce } = await import("@/lib/rate-limit");
    const { upsertJamLogAction } = await import("./actions");
    await upsertJamLogAction({
      jamRouteId: ROUTE_1,
      attempts: 1,
      completed: true,
      zone: false,
    });
    expect(enforce).toHaveBeenCalledWith("mutationsWrite", USER_A);
  });
});

describe("joinJamAction", () => {
  it("rejects a malformed jam id", async () => {
    const { joinJamAction } = await import("./actions");
    const result = await joinJamAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid jam id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { joinJamAction } = await import("./actions");
    expect(await joinJamAction(JAM_1)).toEqual({ error: AUTH_REQUIRED });
  });

  it("joins via the add_jam_player RPC on success", async () => {
    const sb = await mockSignedIn();
    const { joinJamAction } = await import("./actions");
    expect(await joinJamAction(JAM_1)).toEqual({ ok: true });
    const rpc = sb.calls.find((c) => c.source === "add_jam_player");
    expect(rpc?.args[0]).toEqual({ p_jam_id: JAM_1 });
  });

  it("maps an RPC failure (jam full / ended) to a friendly error", async () => {
    await mockSignedIn({
      "rpc:add_jam_player": {
        data: null,
        error: { code: "23514", message: "jam is full" },
      },
    });
    const { joinJamAction } = await import("./actions");
    const result = await joinJamAction(JAM_1);
    expect("error" in result).toBe(true);
  });
});

describe("leaveJamAction", () => {
  it("rejects a malformed jam id", async () => {
    const { leaveJamAction } = await import("./actions");
    const result = await leaveJamAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid jam id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { leaveJamAction } = await import("./actions");
    expect(await leaveJamAction(JAM_1)).toEqual({ error: AUTH_REQUIRED });
  });

  it("leaves via the leave_jam RPC on success", async () => {
    const sb = await mockSignedIn();
    const { leaveJamAction } = await import("./actions");
    expect(await leaveJamAction(JAM_1)).toEqual({ ok: true });
    expect(sb.calls.some((c) => c.source === "leave_jam")).toBe(true);
  });
});

describe("addJamRouteAction", () => {
  it("rejects a malformed jam id", async () => {
    const { addJamRouteAction } = await import("./actions");
    const result = await addJamRouteAction({ jamId: "not-a-uuid" });
    expect(result).toEqual({ error: "Invalid jam id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { addJamRouteAction } = await import("./actions");
    expect(await addJamRouteAction({ jamId: JAM_1 })).toEqual({
      error: AUTH_REQUIRED,
    });
  });

  it("returns the created route row so the client can upsert without waiting on realtime", async () => {
    const route = { id: ROUTE_1, jam_id: JAM_1, number: 1 };
    await mockSignedIn({
      "rpc:add_jam_route": { data: route, error: null },
    });
    const { addJamRouteAction } = await import("./actions");
    expect(await addJamRouteAction({ jamId: JAM_1 })).toEqual({ route });
  });

  it("maps an RPC failure to a friendly error", async () => {
    await mockSignedIn({
      "rpc:add_jam_route": {
        data: null,
        error: { code: "42501", message: "not a player" },
      },
    });
    const { addJamRouteAction } = await import("./actions");
    expect(await addJamRouteAction({ jamId: JAM_1 })).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});

describe("updateJamRouteAction", () => {
  it("rejects a malformed route id", async () => {
    const { updateJamRouteAction } = await import("./actions");
    const result = await updateJamRouteAction({ routeId: "not-a-uuid" });
    expect(result).toEqual({ error: "Invalid route id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { updateJamRouteAction } = await import("./actions");
    expect(await updateJamRouteAction({ routeId: ROUTE_1 })).toEqual({
      error: AUTH_REQUIRED,
    });
  });

  it("returns the updated route row on success", async () => {
    const route = { id: ROUTE_1, jam_id: JAM_1, number: 1 };
    await mockSignedIn({
      "rpc:update_jam_route": { data: route, error: null },
    });
    const { updateJamRouteAction } = await import("./actions");
    expect(await updateJamRouteAction({ routeId: ROUTE_1 })).toEqual({ route });
  });
});

describe("upsertJamLogAction", () => {
  it("rejects a malformed route id", async () => {
    const { upsertJamLogAction } = await import("./actions");
    const result = await upsertJamLogAction({
      jamRouteId: "not-a-uuid",
      attempts: 1,
      completed: true,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid route id" });
  });

  it("rejects a negative attempt count", async () => {
    const { upsertJamLogAction } = await import("./actions");
    const result = await upsertJamLogAction({
      jamRouteId: ROUTE_1,
      attempts: -1,
      completed: false,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid attempt count" });
  });

  it("rejects an absurd attempt count", async () => {
    const { upsertJamLogAction } = await import("./actions");
    const result = await upsertJamLogAction({
      jamRouteId: ROUTE_1,
      attempts: 1000,
      completed: false,
      zone: false,
    });
    expect(result).toEqual({ error: "Invalid attempt count" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { upsertJamLogAction } = await import("./actions");
    expect(
      await upsertJamLogAction({
        jamRouteId: ROUTE_1,
        attempts: 1,
        completed: true,
        zone: false,
      }),
    ).toEqual({ error: AUTH_REQUIRED });
  });

  it("returns the offline-queue-compatible success shape", async () => {
    const sb = await mockSignedIn();
    const { upsertJamLogAction } = await import("./actions");
    const result = await upsertJamLogAction({
      jamRouteId: ROUTE_1,
      attempts: 2,
      completed: true,
      zone: true,
    });
    // Must match withOfflineQueue's synthetic shape exactly — callers
    // check `"error" in result` identically for both paths.
    expect(result).toEqual({ success: true, log: null });
    const rpc = sb.calls.find((c) => c.source === "upsert_jam_log");
    expect(rpc?.args[0]).toEqual({
      p_jam_route_id: ROUTE_1,
      p_attempts: 2,
      p_completed: true,
      p_zone: true,
    });
  });

  it("maps an RPC failure to a friendly error", async () => {
    await mockSignedIn({
      "rpc:upsert_jam_log": {
        data: null,
        error: { code: "42501", message: "not a player" },
      },
    });
    const { upsertJamLogAction } = await import("./actions");
    expect(
      await upsertJamLogAction({
        jamRouteId: ROUTE_1,
        attempts: 1,
        completed: false,
        zone: false,
      }),
    ).toEqual({ error: "You don't have permission to do that." });
  });
});

describe("endJamAction", () => {
  it("rejects a malformed jam id", async () => {
    const { endJamAction } = await import("./actions");
    const result = await endJamAction("not-a-uuid");
    expect(result).toEqual({ error: "Invalid jam id" });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { endJamAction } = await import("./actions");
    expect(await endJamAction(JAM_1)).toEqual({ error: AUTH_REQUIRED });
  });

  it("returns the summary id on success", async () => {
    await mockSignedIn({
      "rpc:end_jam_as_player": { data: "summary-1", error: null },
    });
    const { endJamAction } = await import("./actions");
    expect(await endJamAction(JAM_1)).toEqual({ summaryId: "summary-1" });
  });

  it("maps an RPC failure to a friendly error without running housekeeping", async () => {
    await mockSignedIn({
      "rpc:end_jam_as_player": {
        data: null,
        error: { code: "42501", message: "not a player" },
      },
    });
    const { endJamAction } = await import("./actions");
    expect(await endJamAction(JAM_1)).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});
