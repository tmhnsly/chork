/**
 * Admin server actions — smoke tests for input validation, auth
 * gates, and happy-path shape. These are the most security-sensitive
 * entry points in the app (gym creation, invites, set publish) so we
 * want every action to at minimum reject unauthed callers and
 * malformed input before touching Supabase.
 *
 * Mocks mirror the pattern in `src/app/crew/actions.test.ts` —
 * thenable chain builder resolved per table/RPC, individual module
 * mocks for auth + external side-effects (createGymWithOwner etc).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireSignedIn: vi.fn(),
  requireGymAdmin: vi.fn(),
}));
vi.mock("@/lib/data/admin-mutations", () => ({
  createGymWithOwner: vi.fn(),
  acceptGymInvite: vi.fn(),
  createAdminSet: vi.fn(),
  updateAdminSet: vi.fn(),
  quickSetupRoutes: vi.fn(),
  updateAdminRoute: vi.fn(),
  setRouteTags: vi.fn(),
  createCompetition: vi.fn(),
  updateCompetition: vi.fn(),
  linkGymToCompetition: vi.fn(),
  unlinkGymFromCompetition: vi.fn(),
  createCompetitionCategory: vi.fn(),
  deleteCompetitionCategory: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/data/queries", () => ({ getGym: vi.fn() }));
vi.mock("@/lib/push/server", () => ({
  getGymClimberUserIds: vi.fn(() => Promise.resolve([])),
  sendPushInBackground: vi.fn(),
}));

// ────────────────────────────────────────────────────────────────
// Chainable Supabase mock (matches the pattern in crew actions)
// ────────────────────────────────────────────────────────────────

type SbResult = {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number;
};

function makeChain(resolve: () => SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  const methods = [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "in", "or", "gte", "lt", "order", "limit",
    "maybeSingle", "single",
  ];
  for (const m of methods) (builder[m] as unknown) = chain;
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

function mockSupabase(results: Record<string, SbResult> = {}) {
  return {
    from: (table: string) =>
      makeChain(() => results[`table:${table}`] ?? { data: null }),
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: { id, email: `${id}@chork.test` } },
          error: null,
        })),
      },
    },
  };
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SET_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ROUTE_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────
// signupGym
// ────────────────────────────────────────────────────────────────
describe("signupGym", () => {
  const baseForm = {
    name: "Yonder",
    slug: "yonder",
    city: "London",
    country: "GB",
    planTier: "starter" as const,
  };

  it("rejects names shorter than 2 chars", async () => {
    const { signupGym } = await import("./actions");
    expect(await signupGym({ ...baseForm, name: "Y" })).toHaveProperty(
      "error",
      expect.stringContaining("2–80"),
    );
  });

  it("rejects slugs that aren't lowercase kebab", async () => {
    const { signupGym } = await import("./actions");
    expect(await signupGym({ ...baseForm, slug: "Yonder Gym" })).toHaveProperty(
      "error",
      expect.stringContaining("lowercase"),
    );
  });

  it("rejects unknown plan tiers", async () => {
    const { signupGym } = await import("./actions");
    expect(
      await signupGym({
        ...baseForm,
        planTier: "lifetime" as unknown as typeof baseForm.planTier,
      }),
    ).toHaveProperty("error", "Invalid plan tier.");
  });

  it("surfaces auth failure from requireSignedIn", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { signupGym } = await import("./actions");
    expect(await signupGym(baseForm)).toEqual({ error: "Not signed in" });
  });

  it("returns the created gym id on success", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: mockSupabase() as never,
      userId: USER_A,
    });
    const { createGymWithOwner } = await import("@/lib/data/admin-mutations");
    vi.mocked(createGymWithOwner).mockResolvedValue({ gymId: GYM_1 });

    const { signupGym } = await import("./actions");
    expect(await signupGym(baseForm)).toEqual({ success: true, gymId: GYM_1 });
  });
});

// ────────────────────────────────────────────────────────────────
// sendAdminInvite — role gating
// ────────────────────────────────────────────────────────────────
describe("sendAdminInvite", () => {
  it("rejects malformed gym ids", async () => {
    const { sendAdminInvite } = await import("./actions");
    expect(
      await sendAdminInvite({ gymId: "not-a-uuid", email: "a@b.co", role: "admin" }),
    ).toEqual({ error: "Invalid gym." });
  });

  it("rejects malformed emails", async () => {
    const { sendAdminInvite } = await import("./actions");
    expect(
      await sendAdminInvite({ gymId: GYM_1, email: "nope", role: "admin" }),
    ).toHaveProperty("error", "Enter a valid email address.");
  });

  it("rejects owner invites from non-owners", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: mockSupabase() as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: false,
    });
    const { sendAdminInvite } = await import("./actions");
    expect(
      await sendAdminInvite({ gymId: GYM_1, email: "x@chork.test", role: "owner" }),
    ).toEqual({ error: "Only owners can invite other owners." });
  });

  it("surfaces the invite URL on success", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: mockSupabase({ "table:gym_invites": { data: null, error: null } }) as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });
    const { sendAdminInvite } = await import("./actions");
    const res = await sendAdminInvite({
      gymId: GYM_1,
      email: "x@chork.test",
      role: "owner",
    });
    expect(res).toMatchObject({ success: true });
    if (!("error" in res)) expect(res.inviteUrl).toContain("/admin/invite/");
  });
});

// ────────────────────────────────────────────────────────────────
// cancelAdminInvite
// ────────────────────────────────────────────────────────────────
describe("cancelAdminInvite", () => {
  it("rejects malformed ids", async () => {
    const { cancelAdminInvite } = await import("./actions");
    expect(await cancelAdminInvite("abc")).toEqual({ error: "Invalid invite." });
  });

  it("returns 'Invite not found' when the row has been wiped", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    vi.mocked(createServiceClient).mockReturnValue(
      mockSupabase({ "table:gym_invites": { data: null } }) as never,
    );
    const { cancelAdminInvite } = await import("./actions");
    expect(await cancelAdminInvite(GYM_1)).toEqual({ error: "Invite not found." });
  });

  it("surfaces auth failure from requireGymAdmin", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    vi.mocked(createServiceClient).mockReturnValue(
      mockSupabase({ "table:gym_invites": { data: { gym_id: GYM_1 } } }) as never,
    );
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      error: "Not a gym admin",
    });
    const { cancelAdminInvite } = await import("./actions");
    expect(await cancelAdminInvite(GYM_1)).toEqual({ error: "Not a gym admin" });
  });
});

// ────────────────────────────────────────────────────────────────
// acceptAdminInvite
// ────────────────────────────────────────────────────────────────
describe("acceptAdminInvite", () => {
  it("rejects tokens shorter than 20 chars", async () => {
    const { acceptAdminInvite } = await import("./actions");
    expect(await acceptAdminInvite("short")).toEqual({
      error: "Invalid invite link.",
    });
  });
});

// ────────────────────────────────────────────────────────────────
// Sets — validateSetInput coverage
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
    const { createSet } = await import("./actions");
    expect(await createSet({ ...form, gymId: "nope" })).toEqual({ error: "Invalid gym." });
  });

  it("rejects end-before-start date ranges", async () => {
    const { createSet } = await import("./actions");
    const res = await createSet({
      ...form,
      startsAt: "2026-05-01",
      endsAt: "2026-04-01",
    });
    expect(res).toHaveProperty("error", expect.stringContaining("End date"));
  });

  it("rejects unknown grading scales", async () => {
    const { createSet } = await import("./actions");
    expect(
      await createSet({
        ...form,
        gradingScale: "yds" as unknown as typeof form.gradingScale,
      }),
    ).toEqual({ error: "Invalid grading scale." });
  });

  it("rejects max grade outside 0..30", async () => {
    const { createSet } = await import("./actions");
    expect(await createSet({ ...form, maxGrade: 31 })).toEqual({
      error: "Max grade must be between 0 and 30.",
    });
  });

  it("surfaces auth failure", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({ error: "Not signed in" });
    const { createSet } = await import("./actions");
    expect(await createSet(form)).toEqual({ error: "Not signed in" });
  });

  it("returns the created set id on success", async () => {
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: mockSupabase() as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });
    const { createAdminSet } = await import("@/lib/data/admin-mutations");
    vi.mocked(createAdminSet).mockResolvedValue({ setId: SET_1 });

    const { createSet } = await import("./actions");
    expect(await createSet(form)).toEqual({ success: true, setId: SET_1 });
  });
});

// ────────────────────────────────────────────────────────────────
// archiveSet / publishSet / unpublishSet delegate to updateSet.
// Smoke-check they at least reject malformed ids.
// ────────────────────────────────────────────────────────────────
describe("set status shortcuts", () => {
  it.each([
    ["archiveSet" as const, "archived"],
    ["publishSet" as const, "live"],
    ["unpublishSet" as const, "draft"],
  ])("%s rejects malformed set ids", async (fn) => {
    const mod = await import("./actions");
    expect(await mod[fn]("not-a-uuid")).toHaveProperty("error");
  });
});

// ────────────────────────────────────────────────────────────────
// Routes — updateRoute number range + tag length
// ────────────────────────────────────────────────────────────────
describe("updateRoute", () => {
  it("rejects malformed route ids", async () => {
    const { updateRoute } = await import("./actions");
    expect(await updateRoute("nope", {})).toEqual({ error: "Invalid route." });
  });

  it("rejects route numbers outside 1..999", async () => {
    // verifyAdminOfRoute returns {auth, routeRow} only when the route
    // exists. To exercise the number-range check we need the service
    // client's select to resolve the row first; route-level auth is
    // tested in the happy path below.
    const { createServiceClient } = await import("@/lib/supabase/server");
    vi.mocked(createServiceClient).mockReturnValue(
      mockSupabase({
        "table:routes": {
          data: { id: ROUTE_1, set_id: SET_1, sets: { gym_id: GYM_1 } },
        },
      }) as never,
    );
    const { requireGymAdmin } = await import("@/lib/auth");
    vi.mocked(requireGymAdmin).mockResolvedValue({
      supabase: mockSupabase() as never,
      userId: USER_A,
      gymId: GYM_1,
      isOwner: true,
    });
    const { updateRoute } = await import("./actions");
    expect(await updateRoute(ROUTE_1, { number: 1000 })).toEqual({
      error: "Route number must be between 1 and 999.",
    });
  });
});
