/**
 * Set server actions — smoke tests for input validation, auth gates,
 * and happy-path shape. Publishing a set is the most consequential
 * admin mutation (it decides what the Wall shows), so every action
 * here must at minimum reject unauthed callers and malformed input
 * before touching Supabase.
 *
 * Supabase double: shared harness (`createMockSupabase`), plus
 * individual module mocks for auth + external side-effects
 * (createGymWithOwner etc).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

// The dynamic `await import("./sets-actions")` inside each test pulls in
// the full admin actions dep graph (database.types, supabase clients,
// push helpers, etc) the first time it runs. Under heavy parallel
// worker contention the cold transform can exceed Vitest's 5s default
// per-test budget on the very first import. Bump the per-test +
// per-hook timeout for this file — every subsequent dynamic import
// resolves from the module cache and stays fast.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("@/test/mock-auth")).mockAuthModule());
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/data/gym-queries", () => ({ getGym: vi.fn() }));
vi.mock("@/lib/push/server", () => ({
  getGymClimberUserIds: vi.fn(() => Promise.resolve([])),
  sendPushInBackground: vi.fn(),
}));
// Mock the rate-limit module so the rate-limited actions
// (signupGym, sendAdminInvite, createNewCompetition) don't depend on
// the real Upstash module state across parallel test workers. The
// real `enforce` no-ops when `hasUpstash` is false, but vi.mock
// caching across worker boundaries can let module state from a
// sibling test file (e.g. crew/actions.test.ts which mocks the same
// import) bleed across. Default-allows here; per-test overrides via
// `vi.mocked(enforce).mockResolvedValueOnce({ ok: false, ... })`.
vi.mock("@/lib/rate-limit", () => ({
  enforce: vi.fn(() => Promise.resolve({ ok: true })),
}));

const USER_A = "11111111-1111-1111-1111-111111111111";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SET_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeEach(async () => {
  vi.resetAllMocks();
  // Re-establish the rate-limit default — vi.resetAllMocks() clears
  // the implementation set in the vi.mock factory above. Dynamic
  // import so we read the mocked module (the top-level vi.mock is
  // hoisted before any static import would resolve).
  const { enforce } = await import("@/lib/rate-limit");
  vi.mocked(enforce).mockResolvedValue({ ok: true });
});

// ────────────────────────────────────────────────────────────────
// signupGym
// ────────────────────────────────────────────────────────────────
describe("createSet", () => {
  const form = {
    gymId: GYM_1,
    name: "Set A",
    startsAt: "2026-04-01",
    endsAt: "2026-05-01",
    gradingScale: "v" as const,
    maxGrade: 10,
    status: "draft" as const,
  };

  it("rejects malformed gym ids", async () => {
    const { createSet } = await import("./sets-actions");
    expect(await createSet({ ...form, gymId: "nope" })).toEqual({ error: "Invalid gym." });
  });

  it("rejects end-before-start date ranges", async () => {
    const { createSet } = await import("./sets-actions");
    const res = await createSet({
      ...form,
      startsAt: "2026-05-01",
      endsAt: "2026-04-01",
    });
    expect(res).toHaveProperty("error", expect.stringContaining("End date"));
  });

  it("rejects unknown grading scales", async () => {
    const { createSet } = await import("./sets-actions");
    expect(
      await createSet({
        ...form,
        gradingScale: "yds" as unknown as typeof form.gradingScale,
      }),
    ).toEqual({ error: "Invalid grading scale." });
  });

  it("rejects max grade outside 0..30", async () => {
    const { createSet } = await import("./sets-actions");
    expect(await createSet({ ...form, maxGrade: 31 })).toEqual({
      error: "Max grade must be between 0 and 30.",
    });
  });

  it("surfaces auth failure from the gate", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({ error: "Not signed in" });
    const { createSet } = await import("./sets-actions");
    expect(await createSet(form)).toEqual({ error: "Not signed in" });
  });

  it("returns the created set id on success", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: createMockSupabase({
        "table:sets": { data: { id: SET_1 }, error: null },
      }) as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });

    const { createSet } = await import("./sets-actions");
    expect(await createSet(form)).toEqual({ success: true, setId: SET_1 });
  });

  it("spends write budget, and stops when the bucket trips", async () => {
    // createSet was the one caller that gave gateGymAdminMutation no
    // options, and that gate defaulted to no limit: the most
    // consequential admin write was the unlimited one.
    const { requireGymAdmin } = await import("@/lib/auth");
    const sb = createMockSupabase({ "table:sets": { data: { id: SET_1 }, error: null } });
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: sb as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });
    const { enforce } = await import("@/lib/rate-limit");
    const { createSet } = await import("./sets-actions");

    await createSet(form);
    expect(enforce).toHaveBeenCalledWith("mutationsWrite", USER_A);

    vi.mocked(enforce).mockResolvedValueOnce({ ok: false, error: "Too many requests.", retryAfter: 9 });
    const calls = sb.calls.length;
    expect(await createSet(form)).toEqual({ error: "Too many requests." });
    expect(sb.calls.length).toBe(calls);
  });

  it("does NOT touch the incumbent when creating a draft", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    const sb = createMockSupabase({
      "table:sets": { data: { id: SET_1 }, error: null },
    });
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: sb as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });

    const { createSet } = await import("./sets-actions");
    await createSet(form); // status: "draft"
    const updates = sb.calls.filter(
      (c) => c.source === "sets" && c.method === "update",
    );
    expect(updates).toEqual([]);
  });

  it("creating a LIVE set writes a draft, seeds its routes, then publishes in one step", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    const sb = createMockSupabase({
      "table:sets": { data: { id: SET_1 }, error: null },
      "table:routes": { data: null, error: null },
    });
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: sb as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });

    const { createSet } = await import("./sets-actions");
    // A live set needs routes (see the guard test below), so the
    // quick-create shape is the one that can go straight to live.
    expect(
      await createSet({
        ...form,
        status: "live",
        routes: { count: 2, zoneRouteNumbers: [] },
      }),
    ).toEqual({ success: true, setId: SET_1 });

    // Born a draft. The action used to archive the incumbent and THEN
    // insert, so a failed insert left the gym with no live set. The
    // swap is `publish_set`'s, in one transaction, and it runs last.
    const insert = sb.calls.find((c) => c.source === "sets" && c.method === "insert");
    expect(insert?.args[0]).toMatchObject({ status: "draft" });
    expect(sb.calls.some((c) => c.source === "sets" && c.method === "update")).toBe(false);

    const order = sb.calls
      .filter((c) => c.method === "insert" || c.source === "publish_set")
      .map((c) => c.source);
    expect(order).toEqual(["sets", "routes", "publish_set"]);
    expect(sb.calls.find((c) => c.source === "publish_set")?.args[0]).toEqual({
      p_set_id: SET_1,
    });
  });

  it("a publish that fails leaves a draft behind, and says so", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    const { getGymClimberUserIds } = await import("@/lib/push/server");
    const sb = createMockSupabase({
      "table:sets": { data: { id: SET_1 }, error: null },
      "table:routes": { data: null, error: null },
      "rpc:publish_set": { data: null, error: { code: "42501", message: "Set not found" } },
    });
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: sb as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });

    const { createSet } = await import("./sets-actions");
    const result = await createSet({
      ...form,
      status: "live",
      routes: { count: 2, zoneRouteNumbers: [] },
    });
    expect(result).toEqual({
      error: "You don't have permission to do that. The set was saved as a draft.",
    });
    // Nothing went live, so nobody is told it did.
    expect(getGymClimberUserIds).not.toHaveBeenCalled();
  });

  it("quick-create seeds numbered routes with zone flags in the same action", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    const sb = createMockSupabase({
      "table:sets": { data: { id: SET_1 }, error: null },
      "table:routes": { data: null, error: null },
    });
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: sb as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });

    const { createSet } = await import("./sets-actions");
    const res = await createSet({
      ...form,
      status: "live",
      routes: { count: 3, zoneRouteNumbers: [2, 99] }, // 99 out of range → dropped
    });
    expect(res).toEqual({ success: true, setId: SET_1 });

    const insert = sb.calls.find(
      (c) => c.source === "routes" && c.method === "insert",
    );
    expect(insert?.args[0]).toEqual([
      { set_id: SET_1, number: 1, has_zone: false },
      { set_id: SET_1, number: 2, has_zone: true },
      { set_id: SET_1, number: 3, has_zone: false },
    ]);
  });

  it("refuses to publish straight to live with no routes (empty Wall guard)", async () => {
    // Mirrors updateSet's go-live guard. Without it, /admin/sets/new →
    // "Publish" archived the gym's incumbent live set AND left a live
    // set with zero routes — a blank Wall for every climber.
    const { requireGymAdmin } = await import("@/lib/auth");
    const sb = createMockSupabase({
      "table:sets": { data: { id: SET_1 }, error: null },
    });
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: sb as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });

    const { createSet } = await import("./sets-actions");
    expect(await createSet({ ...form, status: "live" })).toEqual({
      error: "Add at least one route before publishing this set.",
    });
    // And it must bail BEFORE archiving the incumbent.
    expect(sb.calls.filter((c) => c.source === "sets")).toEqual([]);
  });

  it("announces to the gym when a set is created straight to live", async () => {
    // Same domain event as publishing a draft, so it gets the same
    // Announcement. Only the home-page quick-create reaches this path
    // (it seeds routes in the same call).
    const { getGymClimberUserIds } = await import("@/lib/push/server");
    vi.mocked(getGymClimberUserIds).mockResolvedValue([USER_A]);
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: createMockSupabase({
        "table:sets": { data: { id: SET_1 }, error: null },
        "table:routes": { data: null, error: null },
      }) as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });

    const { createSet } = await import("./sets-actions");
    await createSet({
      ...form,
      status: "live",
      routes: { count: 2, zoneRouteNumbers: [] },
    });
    expect(getGymClimberUserIds).toHaveBeenCalledWith(GYM_1);
  });

  it("does NOT announce when the set is created as a draft", async () => {
    const { getGymClimberUserIds } = await import("@/lib/push/server");
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: createMockSupabase({
        "table:sets": { data: { id: SET_1 }, error: null },
      }) as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });

    const { createSet } = await import("./sets-actions");
    await createSet(form); // status: "draft"
    expect(getGymClimberUserIds).not.toHaveBeenCalled();
  });

  it("rejects a route count outside 1..100", async () => {
    const { createSet } = await import("./sets-actions");
    expect(
      await createSet({
        ...form,
        routes: { count: 0, zoneRouteNumbers: [] },
      }),
    ).toEqual({ error: "Route count must be between 1 and 100." });
  });
});

// ────────────────────────────────────────────────────────────────
// archiveSet / publishSet / unpublishSet delegate to updateSet.
// Smoke-check they at least reject malformed ids.
// ────────────────────────────────────────────────────────────────
describe("set status shortcuts", () => {
  it.each(["archiveSet", "publishSet", "unpublishSet"] as const)(
    "%s rejects malformed set ids",
    async (fn) => {
      const mod = await import("./sets-actions");
      expect(await mod[fn]("not-a-uuid")).toHaveProperty("error");
    },
  );
});

// ────────────────────────────────────────────────────────────────
// Routes — updateRoute number range + tag length
// ────────────────────────────────────────────────────────────────
describe("updateSet", () => {
  /** Wire the service-role pre-read (set row + route count) and the
   *  admin's own client used for the writes. */
  async function primeUpdate(
    setRow: Record<string, unknown> | null,
    routeCount = 1,
    // What the admin's own UPDATE hands back. `null` with no error is
    // what row-level security does when it filters the row out: it
    // changes nothing and reports nothing. This double primed exactly
    // that for every case and the action read it as success, so the
    // suite passed while no gym admin could change a Set.
    written: { id: string } | null = { id: SET_1 },
    // What `publish_set` answers. Default: it published.
    publish: { data?: unknown; error?: { code: string; message: string } | null } = {
      data: { id: SET_1 },
      error: null,
    },
  ) {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const service = createMockSupabase({
      "table:sets": { data: setRow },
      "table:routes": { data: [], error: null, count: routeCount },
    });
    vi.mocked(createServiceClient).mockReturnValue(service as never);

    const sb = createMockSupabase({
      "table:sets": { data: written, error: null },
      "rpc:publish_set": publish,
    });
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: sb as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });
    return sb;
  }

  const liveRow = {
    gym_id: GYM_1,
    owner_kind: "gym",
    status: "live",
    name: "Spring",
    starts_at: "2026-04-01",
    ends_at: "2026-05-01",
  };

  it("rejects a malformed set id before any read", async () => {
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet("nope", { name: "x" })).toEqual({ error: "Invalid set." });
  });

  it("errors when the set doesn't exist", async () => {
    await primeUpdate(null);
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { name: "x" })).toEqual({ error: "Set not found." });
  });

  it("validates the patch — max grade out of range is rejected", async () => {
    // Regression: this path validated NOTHING but the set id, so the
    // client `<input max={30}>` was the only guard on the value.
    await primeUpdate(liveRow);
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { maxGrade: 9999 })).toEqual({
      error: "Max grade must be between 0 and 30.",
    });
  });

  it("validates the RESULTING range, not just supplied fields", async () => {
    // Moving only startsAt past the STORED ends_at must fail.
    await primeUpdate(liveRow);
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { startsAt: "2026-06-01" })).toEqual({
      error: "End date must be on or after the start date.",
    });
  });

  it("a field-only edit leaves status untouched — never unpublishes a live set", async () => {
    // The bug this pins: SetForm's "Save changes" sent status:"draft"
    // unconditionally, so editing a live set's name emptied the Wall
    // for the whole gym. The action must only patch supplied keys.
    const sb = await primeUpdate(liveRow);
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { name: "Renamed" })).toEqual({ success: true });

    const update = sb.calls.find(
      (c) => c.source === "sets" && c.method === "update",
    );
    expect(update?.args[0]).toEqual({ name: "Renamed" });
    expect(update?.args[0]).not.toHaveProperty("status");
  });

  it("refuses to publish a set with no routes, in the database's own words", async () => {
    // The rule lives in `publish_set` now, beside the swap it guards.
    const { getGymClimberUserIds } = await import("@/lib/push/server");
    await primeUpdate({ ...liveRow, status: "draft" }, 0, { id: SET_1 }, {
      data: null,
      error: { code: "22023", message: "Add at least one route before publishing this set." },
    });
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { status: "live" })).toEqual({
      error: "Add at least one route before publishing this set.",
    });
    expect(getGymClimberUserIds).not.toHaveBeenCalled();
  });

  it("publishes through publish_set, never by writing the status column", async () => {
    // Two statements (archive the incumbent, then flip this one) could
    // stop between them. The RPC does both or neither.
    const sb = await primeUpdate({ ...liveRow, status: "draft" }, 3);
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { status: "live" })).toEqual({ success: true });

    expect(sb.calls.find((c) => c.source === "publish_set")?.args[0]).toEqual({
      p_set_id: SET_1,
    });
    expect(sb.calls.some((c) => c.source === "sets" && c.method === "update")).toBe(false);
  });

  it("publishing with other edits saves them first, without the status", async () => {
    const sb = await primeUpdate({ ...liveRow, status: "draft" }, 3);
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { name: "Autumn", status: "live" })).toEqual({ success: true });

    const update = sb.calls.find((c) => c.source === "sets" && c.method === "update");
    expect(update?.args[0]).toEqual({ name: "Autumn" });
    const order = sb.calls
      .filter((c) => (c.source === "sets" && c.method === "update") || c.source === "publish_set")
      .map((c) => c.source);
    expect(order).toEqual(["sets", "publish_set"]);
  });

  it("announces the draft → live transition to the gym's climbers", async () => {
    const { getGymClimberUserIds } = await import("@/lib/push/server");
    vi.mocked(getGymClimberUserIds).mockResolvedValue([USER_A]);
    await primeUpdate({ ...liveRow, status: "draft" }, 2);

    const { updateSet } = await import("./sets-actions");
    await updateSet(SET_1, { status: "live" });
    expect(getGymClimberUserIds).toHaveBeenCalledWith(GYM_1);
  });

  it("reports an edit the database refused instead of calling it saved", async () => {
    // Found in production: `sets` had no UPDATE policy, so an edit
    // changed nothing and the action returned success.
    await primeUpdate(liveRow, 2, null);
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { name: "Renamed" })).toEqual({
      error: "That set couldn't be changed.",
    });
  });

  it("announces nothing when the publish is refused", async () => {
    // Publish used to report success and tell every climber at the gym
    // a new set was live, over a set that had not moved.
    const { getGymClimberUserIds } = await import("@/lib/push/server");
    await primeUpdate({ ...liveRow, status: "draft" }, 2, { id: SET_1 }, {
      data: null,
      error: { code: "42501", message: "Set not found" },
    });
    const { updateSet } = await import("./sets-actions");
    expect(await updateSet(SET_1, { status: "live" })).toEqual({
      error: "You don't have permission to do that.",
    });
    expect(getGymClimberUserIds).not.toHaveBeenCalled();
  });

  it("does NOT announce when the set was already live", async () => {
    const { getGymClimberUserIds } = await import("@/lib/push/server");
    await primeUpdate(liveRow, 2);
    const { updateSet } = await import("./sets-actions");
    await updateSet(SET_1, { name: "Renamed" });
    expect(getGymClimberUserIds).not.toHaveBeenCalled();
  });
});
