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

import {
  requireAdminOfSet,
  requireAdminOfRoute,
  requireCompetitionOrganiser,
  requireCompetitionOrganiserOrGymAdmin,
} from "./auth";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SET_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ROUTE_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const COMP_1 = "dddddddd-dddd-dddd-dddd-dddddddddddd";

type SbResult = { data?: unknown; error?: unknown };

function makeChain(resolve: () => SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  for (const m of ["select", "eq", "order", "limit", "maybeSingle", "single"]) {
    builder[m] = chain;
  }
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

function makeClient(results: Record<string, SbResult | (() => SbResult)>) {
  return {
    from: (table: string) =>
      makeChain(() => {
        const r = results[`table:${table}`];
        return typeof r === "function" ? r() : (r ?? { data: null });
      }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────
// requireAdminOfSet
// ────────────────────────────────────────────────────────────────

describe("requireAdminOfSet", () => {
  it("rejects malformed set id without touching the DB", async () => {
    const result = await requireAdminOfSet("nope");
    expect(result).toEqual({ error: "Invalid set." });
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(getServerUserMock).not.toHaveBeenCalled();
  });

  it("returns Set not found when the row is missing", async () => {
    createServiceClientMock.mockReturnValue(
      makeClient({ "table:sets": { data: null } }),
    );
    const result = await requireAdminOfSet(SET_1);
    expect(result).toEqual({ error: "Set not found." });
    // Auth check shouldn't have run if the set didn't exist.
    expect(getServerUserMock).not.toHaveBeenCalled();
  });

  it("rejects when caller is not an admin of the owning gym", async () => {
    createServiceClientMock.mockReturnValue(
      makeClient({
        "table:sets": { data: { gym_id: GYM_1 } },
      }),
    );
    // requireGymAdmin: getServerUser returns the user, but the
    // gym_admins lookup returns nothing → not an admin.
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      makeClient({ "table:gym_admins": { data: null } }),
    );
    const result = await requireAdminOfSet(SET_1);
    expect(result).toEqual({ error: "You are not an admin of that gym" });
  });

  it("returns auth + setRow on the happy path", async () => {
    createServiceClientMock.mockReturnValue(
      makeClient({
        "table:sets": { data: { gym_id: GYM_1 } },
      }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      makeClient({ "table:gym_admins": { data: { role: "admin" } } }),
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
      makeClient({
        "table:sets": { data: { gym_id: GYM_1 } },
      }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      makeClient({ "table:gym_admins": { data: { role: "owner" } } }),
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
    expect(await requireAdminOfRoute("nope")).toEqual({ error: "Invalid route." });
  });

  it("returns Route not found when the join misses", async () => {
    createServiceClientMock.mockReturnValue(
      makeClient({ "table:routes": { data: null } }),
    );
    expect(await requireAdminOfRoute(ROUTE_1)).toEqual({ error: "Route not found." });
  });

  it("returns Route not found when the joined set has no gym_id", async () => {
    // Defensive: a row with a stale FK or a bad shape should fail the
    // gate rather than evaluate gym admin checks against undefined.
    createServiceClientMock.mockReturnValue(
      makeClient({
        "table:routes": { data: { id: ROUTE_1, set_id: SET_1, sets: null } },
      }),
    );
    expect(await requireAdminOfRoute(ROUTE_1)).toEqual({ error: "Route not found." });
  });

  it("happy path: sets returned as nested object", async () => {
    createServiceClientMock.mockReturnValue(
      makeClient({
        "table:routes": {
          data: { id: ROUTE_1, set_id: SET_1, sets: { gym_id: GYM_1 } },
        },
      }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      makeClient({ "table:gym_admins": { data: { role: "admin" } } }),
    );
    const result = await requireAdminOfRoute(ROUTE_1);
    expect(result).toMatchObject({
      auth: expect.objectContaining({ userId: USER_A, gymId: GYM_1 }),
      routeRow: { id: ROUTE_1, set_id: SET_1, gym_id: GYM_1 },
    });
  });

  it("happy path: sets returned as array (Supabase join variation)", async () => {
    createServiceClientMock.mockReturnValue(
      makeClient({
        "table:routes": {
          data: { id: ROUTE_1, set_id: SET_1, sets: [{ gym_id: GYM_1 }] },
        },
      }),
    );
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(
      makeClient({ "table:gym_admins": { data: { role: "admin" } } }),
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
    createServerSupabaseMock.mockReturnValue(makeClient({}));
    const result = await requireCompetitionOrganiser(COMP_1);
    expect(result).toMatchObject({ error: expect.stringMatching(/sign/i) });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("returns Competition not found when the row is missing", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(makeClient({}));
    createServiceClientMock.mockReturnValue(
      makeClient({ "table:competitions": { data: null } }),
    );
    expect(await requireCompetitionOrganiser(COMP_1)).toEqual({
      error: "Competition not found.",
    });
  });

  it("rejects when caller is signed in but not the organiser", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(makeClient({}));
    createServiceClientMock.mockReturnValue(
      makeClient({
        "table:competitions": { data: { organiser_id: USER_B } },
      }),
    );
    expect(await requireCompetitionOrganiser(COMP_1)).toEqual({
      error: "Only the organiser can manage this competition.",
    });
  });

  it("returns the auth handle when caller is the organiser", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServerSupabaseMock.mockReturnValue(makeClient({}));
    createServiceClientMock.mockReturnValue(
      makeClient({
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
    createServerSupabaseMock.mockReturnValue(makeClient({}));
    createServiceClientMock.mockReturnValue(
      makeClient({
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
      makeClient({
        "table:competitions": { data: { organiser_id: USER_B } },
      }),
    );
    // Gym admin lookup: caller IS an admin of the gym → succeed.
    createServerSupabaseMock.mockReturnValue(
      makeClient({ "table:gym_admins": { data: { role: "admin" } } }),
    );
    const result = await requireCompetitionOrganiserOrGymAdmin(COMP_1, GYM_1);
    expect(result).toMatchObject({ userId: USER_A, role: "gymAdmin" });
  });

  it("rejects with the composite error when neither path matches", async () => {
    getServerUserMock.mockResolvedValue({ id: USER_A });
    createServiceClientMock.mockReturnValue(
      makeClient({
        "table:competitions": { data: { organiser_id: USER_B } },
      }),
    );
    createServerSupabaseMock.mockReturnValue(
      makeClient({ "table:gym_admins": { data: null } }),
    );
    const result = await requireCompetitionOrganiserOrGymAdmin(COMP_1, GYM_1);
    expect(result).toEqual({
      error: "Not authorised to manage this competition/gym.",
    });
  });
});
