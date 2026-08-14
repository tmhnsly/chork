import { describe, it, expect, vi, beforeEach } from "vitest";

// The resource-scoped helpers in auth.ts compose with requireGymAdmin
// and requireSignedIn via intra-module calls. vi.mock can't replace
// intra-module references, so we mock the underlying primitives those
// helpers depend on (getServerUser + createServerSupabase +
// createServiceClient) and let the real auth-helper code run end to
// end through the mocks.

const getServerUserMock = vi.fn();
const createServerSupabaseMock = vi.fn();
const createServiceClientMock = vi.fn();

vi.mock("./supabase/server", () => ({
  createServerSupabase: () => createServerSupabaseMock(),
  createServiceClient: () => createServiceClientMock(),
  getServerUser: () => getServerUserMock(),
  getServerProfile: vi.fn(),
}));
vi.mock("./rate-limit", () => ({ enforce: vi.fn() }));

import {
  requireAdminOfSet,
  requireAdminOfRoute,
  requireCompetitionOrganiser,
  requireCompetitionOrganiserOrGymAdmin,
  requireSameGymScope,
  gateSignedInMutation,
} from "./auth";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SET_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ROUTE_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const COMP_1 = "dddddddd-dddd-dddd-dddd-dddddddddddd";

import { createMockSupabase } from "@/test/mock-supabase";

beforeEach(async () => {
  vi.resetAllMocks();
  const { enforce } = await import("./rate-limit");
  vi.mocked(enforce).mockResolvedValue({ ok: true });
});

// ────────────────────────────────────────────────────────────────
// requireAdminOfSet
// ────────────────────────────────────────────────────────────────

describe("requireAdminOfSet", () => {
  it("rejects malformed set id without touching the DB", async () => {
    const result = await requireAdminOfSet("nope");
    expect(result).toMatchObject({ error: "Invalid set.", reason: "invalid" });
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(getServerUserMock).not.toHaveBeenCalled();
  });

  it("returns Set not found when the row is missing", async () => {
    createServiceClientMock.mockReturnValue(
      createMockSupabase({ "table:sets": { data: null } }),
    );
    const result = await requireAdminOfSet(SET_1);
    expect(result).toMatchObject({ error: "Set not found.", reason: "not-found" });
    // Auth check shouldn't have run if the set didn't exist.
    expect(getServerUserMock).not.toHaveBeenCalled();
  });

  it("rejects when caller is not an admin of the owning gym", async () => {
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:sets": { data: { gym_id: GYM_1 } },
      }),
    );
    // requireGymAdmin: getServerUser returns the user, but the
    // gym_admins lookup returns nothing → not an admin.
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      createMockSupabase({ "table:gym_admins": { data: null } }),
    );
    const result = await requireAdminOfSet(SET_1);
    expect(result).toMatchObject({ error: "You are not an admin of that gym", reason: "forbidden" });
  });

  it("returns auth + setRow on the happy path", async () => {
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:sets": { data: { gym_id: GYM_1 } },
      }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      createMockSupabase({ "table:gym_admins": { data: { role: "admin" } } }),
    );
    const result = await requireAdminOfSet(SET_1);
    expect(result).toMatchObject({
      auth: expect.objectContaining({
        userId: USER_A,
        gymId: GYM_1,
        isOwner: false,
      }),
      setRow: { gym_id: GYM_1 },
    });
  });

  it("flips isOwner when the caller's gym_admins role is 'owner'", async () => {
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:sets": { data: { gym_id: GYM_1 } },
      }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      createMockSupabase({ "table:gym_admins": { data: { role: "owner" } } }),
    );
    const result = await requireAdminOfSet(SET_1);
    expect(result).toMatchObject({ auth: expect.objectContaining({ isOwner: true }) });
  });
});

// ────────────────────────────────────────────────────────────────
// requireAdminOfRoute
// ────────────────────────────────────────────────────────────────

describe("requireAdminOfRoute", () => {
  it("rejects malformed route id", async () => {
    expect(await requireAdminOfRoute("nope")).toMatchObject({ error: "Invalid route.", reason: "invalid" });
  });

  it("returns Route not found when the join misses", async () => {
    createServiceClientMock.mockReturnValue(
      createMockSupabase({ "table:routes": { data: null } }),
    );
    expect(await requireAdminOfRoute(ROUTE_1)).toMatchObject({ error: "Route not found.", reason: "not-found" });
  });

  it("returns Route not found when the joined set has no gym_id", async () => {
    // Defensive: a row with a stale FK or a bad shape should fail the
    // gate rather than evaluate gym admin checks against undefined.
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:routes": { data: { id: ROUTE_1, set_id: SET_1, sets: null } },
      }),
    );
    expect(await requireAdminOfRoute(ROUTE_1)).toMatchObject({ error: "Route not found.", reason: "not-found" });
  });

  it("happy path: sets returned as nested object", async () => {
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:routes": {
          data: { id: ROUTE_1, set_id: SET_1, sets: { gym_id: GYM_1 } },
        },
      }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      createMockSupabase({ "table:gym_admins": { data: { role: "admin" } } }),
    );
    const result = await requireAdminOfRoute(ROUTE_1);
    expect(result).toMatchObject({
      auth: expect.objectContaining({ userId: USER_A, gymId: GYM_1 }),
      routeRow: { id: ROUTE_1, set_id: SET_1, gym_id: GYM_1 },
    });
  });

  it("happy path: sets returned as array (Supabase join variation)", async () => {
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:routes": {
          data: { id: ROUTE_1, set_id: SET_1, sets: [{ gym_id: GYM_1 }] },
        },
      }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      createMockSupabase({ "table:gym_admins": { data: { role: "admin" } } }),
    );
    const result = await requireAdminOfRoute(ROUTE_1);
    expect(result).toMatchObject({
      routeRow: { id: ROUTE_1, set_id: SET_1, gym_id: GYM_1 },
    });
  });
});

// ────────────────────────────────────────────────────────────────
// requireCompetitionOrganiser
// ────────────────────────────────────────────────────────────────

describe("requireCompetitionOrganiser", () => {
  it("rejects malformed competition id", async () => {
    expect(await requireCompetitionOrganiser("nope")).toEqual({
      error: "Invalid competition.",
    });
    expect(getServerUserMock).not.toHaveBeenCalled();
  });

  it("forwards the auth failure when caller is not signed in", async () => {
    getServerUserMock.mockResolvedValue(null);
    createServerSupabaseMock.mockReturnValue(createMockSupabase({}));
    const result = await requireCompetitionOrganiser(COMP_1);
    expect(result).toMatchObject({ error: expect.stringMatching(/sign/i) });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns Competition not found when the row is missing", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(createMockSupabase({}));
    createServiceClientMock.mockReturnValue(
      createMockSupabase({ "table:competitions": { data: null } }),
    );
    expect(await requireCompetitionOrganiser(COMP_1)).toEqual({
      error: "Competition not found.",
    });
  });

  it("rejects when caller is signed in but not the organiser", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(createMockSupabase({}));
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:competitions": { data: { organiser_id: USER_B } },
      }),
    );
    expect(await requireCompetitionOrganiser(COMP_1)).toEqual({
      error: "Only the organiser can manage this competition.",
    });
  });

  it("returns the auth handle when caller is the organiser", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(createMockSupabase({}));
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:competitions": { data: { organiser_id: USER_A } },
      }),
    );
    const result = await requireCompetitionOrganiser(COMP_1);
    expect(result).toMatchObject({ userId: USER_A });
  });
});

// ────────────────────────────────────────────────────────────────
// requireCompetitionOrganiserOrGymAdmin
// ────────────────────────────────────────────────────────────────

describe("requireCompetitionOrganiserOrGymAdmin", () => {
  it("rejects malformed competition id without touching the DB", async () => {
    const result = await requireCompetitionOrganiserOrGymAdmin("nope", GYM_1);
    expect(result).toEqual({ error: "Invalid competition." });
    expect(getServerUserMock).not.toHaveBeenCalled();
  });

  it("rejects malformed gym id without touching the DB", async () => {
    const result = await requireCompetitionOrganiserOrGymAdmin(COMP_1, "nope");
    expect(result).toEqual({ error: "Invalid gym." });
    expect(getServerUserMock).not.toHaveBeenCalled();
  });

  it("returns role=organiser when caller is the competition organiser", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(createMockSupabase({}));
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:competitions": { data: { organiser_id: USER_A } },
      }),
    );
    const result = await requireCompetitionOrganiserOrGymAdmin(COMP_1, GYM_1);
    expect(result).toMatchObject({ userId: USER_A, role: "organiser" });
  });

  it("falls back to gym-admin when organiser path fails", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    // Organiser lookup: someone ELSE is the organiser → fail.
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:competitions": { data: { organiser_id: USER_B } },
      }),
    );
    // Gym admin lookup: caller IS an admin of the gym → succeed.
    createServerSupabaseMock.mockReturnValue(
      createMockSupabase({ "table:gym_admins": { data: { role: "admin" } } }),
    );
    const result = await requireCompetitionOrganiserOrGymAdmin(COMP_1, GYM_1);
    expect(result).toMatchObject({ userId: USER_A, role: "gymAdmin" });
  });

  it("rejects with the composite error when neither path matches", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServiceClientMock.mockReturnValue(
      createMockSupabase({
        "table:competitions": { data: { organiser_id: USER_B } },
      }),
    );
    createServerSupabaseMock.mockReturnValue(
      createMockSupabase({ "table:gym_admins": { data: null } }),
    );
    const result = await requireCompetitionOrganiserOrGymAdmin(COMP_1, GYM_1);
    expect(result).toEqual({
      error: "Not authorised to manage this competition/gym.",
    });
  });
});

// ────────────────────────────────────────────────────────────────
// requireSameGymScope — the cross-gym exposure gate
// ────────────────────────────────────────────────────────────────

describe("requireSameGymScope", () => {
  it("rejects a set that belongs to a different gym", async () => {
    const sb = createMockSupabase({
      "table:sets": { data: { gym_id: "some-other-gym" } },
    });
    expect(
      await requireSameGymScope(sb as never, GYM_1, SET_1, USER_B),
    ).toEqual({ error: "Set not found" });
  });

  it("rejects a target user who is not a member of the caller's gym", async () => {
    const sb = createMockSupabase({
      "table:sets": { data: { gym_id: GYM_1 } },
      "table:gym_memberships": { data: null },
    });
    expect(
      await requireSameGymScope(sb as never, GYM_1, SET_1, USER_B),
    ).toEqual({ error: "Climber not in this gym" });
  });

  it("rejects when the set lookup errors (fail closed, never fail open)", async () => {
    const sb = createMockSupabase({
      "table:sets": { data: null, error: { code: "57014", message: "timeout" } },
    });
    expect(
      await requireSameGymScope(sb as never, GYM_1, SET_1, USER_B),
    ).toEqual({ error: "Set not found" });
  });

  it("passes when the set is in-gym AND the target is a member", async () => {
    const sb = createMockSupabase({
      "table:sets": { data: { gym_id: GYM_1 } },
      "table:gym_memberships": { data: { user_id: USER_B } },
    });
    expect(
      await requireSameGymScope(sb as never, GYM_1, SET_1, USER_B),
    ).toEqual({ ok: true });
  });
});

// ────────────────────────────────────────────────────────────────
// gateSignedInMutation — signed-in (gymless-safe) mutation prelude
// ────────────────────────────────────────────────────────────────

describe("gateSignedInMutation", () => {
  it("rejects a malformed resource id with the caller's label", async () => {
    expect(await gateSignedInMutation("nope", "jam id")).toEqual({
      error: "Invalid jam id",
    });
  });

  it("skips uuid validation when resourceId is null (payload-validated actions)", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockResolvedValue(createMockSupabase());
    const result = await gateSignedInMutation(null, "jam");
    expect("error" in result).toBe(false);
  });

  it("surfaces auth failure", async () => {
    getServerUserMock.mockResolvedValue(null);
    createServerSupabaseMock.mockResolvedValue(createMockSupabase());
    const result = await gateSignedInMutation(SET_1, "set");
    expect(result).toHaveProperty("error");
  });

  it("enforces the mutationsWrite rate limit BY DEFAULT", async () => {
    // The default is the point of the gate: the jam actions re-typed
    // this prelude by hand and all seven skipped the limit.
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockResolvedValue(createMockSupabase());
    const { enforce } = await import("./rate-limit");
    await gateSignedInMutation(SET_1, "set");
    expect(enforce).toHaveBeenCalledWith("mutationsWrite", USER_A);
  });

  it("surfaces the rate-limit error when the bucket trips", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockResolvedValue(createMockSupabase());
    const { enforce } = await import("./rate-limit");
    vi.mocked(enforce).mockResolvedValueOnce({
      ok: false,
      error: "Too many requests. Try again in 9s.",
      retryAfter: 9,
    });
    expect(await gateSignedInMutation(SET_1, "set")).toEqual({
      error: "Too many requests. Try again in 9s.",
    });
  });

  it("skips the rate limit only on an explicit null", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockResolvedValue(createMockSupabase());
    const { enforce } = await import("./rate-limit");
    await gateSignedInMutation(SET_1, "set", { rateLimit: null });
    expect(enforce).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────
// Resource gates authorise against the RESOURCE's gym
// ────────────────────────────────────────────────────────────────

describe("requireAdminOfSet — multi-gym", () => {
  const GYM_OTHER = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

  it("checks admin rights against the SET's gym, not a default one", async () => {
    // Regression: the admin set pages authorised by listing the sets
    // of whichever gym `requireGymAdmin()` resolved (the caller's
    // OLDEST gym_admins row) and looking for the id in that list — so
    // an admin of two gyms got a hard 404 on every set belonging to
    // the other one.
    createServiceClientMock.mockReturnValue(
      createMockSupabase({ "table:sets": { data: { gym_id: GYM_OTHER } } }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    const adminClient = createMockSupabase({
      "table:gym_admins": { data: { role: "admin" } },
    });
    createServerSupabaseMock.mockReturnValue(adminClient);

    const result = await requireAdminOfSet(SET_1);
    expect(result).toMatchObject({
      auth: expect.objectContaining({ gymId: GYM_OTHER }),
      setRow: { gym_id: GYM_OTHER },
    });

    // The admin-rights lookup must be scoped to the set's gym.
    const eqArgs = adminClient.calls
      .filter((c) => c.source === "gym_admins" && c.method === "eq")
      .map((c) => c.args);
    expect(eqArgs).toContainEqual(["gym_id", GYM_OTHER]);
  });

  it.each([
    ["nope", "invalid"],
    [SET_1, "not-found"],
  ])("reports a machine-readable reason (%s -> %s)", async (setId, reason) => {
    createServiceClientMock.mockReturnValue(
      createMockSupabase({ "table:sets": { data: null } }),
    );
    const result = await requireAdminOfSet(setId);
    expect(result).toMatchObject({ reason });
  });

  it("reports 'forbidden' when the caller doesn't admin the set's gym", async () => {
    // Pages branch on this to choose redirect-vs-404. Matching the
    // user-facing copy instead would make a reworded string silently
    // change the redirect.
    createServiceClientMock.mockReturnValue(
      createMockSupabase({ "table:sets": { data: { gym_id: GYM_1 } } }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      createMockSupabase({ "table:gym_admins": { data: null } }),
    );
    expect(await requireAdminOfSet(SET_1)).toMatchObject({
      reason: "forbidden",
    });
  });
});
