/**
 * Profile-page server actions — `fetchSetPlacement` is the only
 * entry point. It enforces two cross-resource gates:
 *   • the set belongs to the caller's gym;
 *   • the target user is a member of the caller's gym.
 *
 * Either gate failing is a silent `{ error }` — never a leak of
 * the target's data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/data/queries", () => ({
  getLeaderboardUserRow: vi.fn(),
}));

type SbResult = { data?: unknown; error?: unknown };

function makeChain(resolve: () => SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  const methods = ["select", "eq", "maybeSingle"];
  for (const m of methods) (builder[m] as unknown) = chain;
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

function mockSupabase(tables: Record<string, SbResult> = {}) {
  return {
    from: (table: string) =>
      makeChain(() => tables[`table:${table}`] ?? { data: null }),
  };
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const GYM_OWN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GYM_OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SET_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("fetchSetPlacement", () => {
  it("rejects malformed user ids", async () => {
    const { fetchSetPlacement } = await import("./actions");
    expect(await fetchSetPlacement("nope", SET_1)).toEqual({
      error: "Invalid request",
    });
  });

  it("rejects malformed set ids", async () => {
    const { fetchSetPlacement } = await import("./actions");
    expect(await fetchSetPlacement(USER_A, "nope")).toEqual({
      error: "Invalid request",
    });
  });

  it("surfaces auth failure", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" });
    const { fetchSetPlacement } = await import("./actions");
    expect(await fetchSetPlacement(USER_B, SET_1)).toEqual({
      error: "Not signed in",
    });
  });

  it("blocks cross-gym set lookup", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase({
        "table:sets": { data: { gym_id: GYM_OTHER } },
      }) as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { fetchSetPlacement } = await import("./actions");
    expect(await fetchSetPlacement(USER_B, SET_1)).toEqual({
      error: "Set not found",
    });
  });

  it("blocks lookup of a user who isn't a member of the caller's gym", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase({
        "table:sets": { data: { gym_id: GYM_OWN } },
        "table:gym_memberships": { data: null },
      }) as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { fetchSetPlacement } = await import("./actions");
    expect(await fetchSetPlacement(USER_B, SET_1)).toEqual({
      error: "Not in this gym",
    });
  });

  it("returns the user's rank on success", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase({
        "table:sets": { data: { gym_id: GYM_OWN } },
        "table:gym_memberships": { data: { user_id: USER_B } },
      }) as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { getLeaderboardUserRow } = await import("@/lib/data/queries");
    vi.mocked(getLeaderboardUserRow).mockResolvedValue({
      user_id: USER_B,
      username: "b",
      name: "",
      avatar_url: "",
      points: 10,
      sends: 1,
      flashes: 0,
      zones: 0,
      rank: 7,
    });

    const { fetchSetPlacement } = await import("./actions");
    expect(await fetchSetPlacement(USER_B, SET_1)).toEqual({ rank: 7 });
  });

  it("returns rank: null when the user has no activity in the set", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase({
        "table:sets": { data: { gym_id: GYM_OWN } },
        "table:gym_memberships": { data: { user_id: USER_B } },
      }) as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { getLeaderboardUserRow } = await import("@/lib/data/queries");
    vi.mocked(getLeaderboardUserRow).mockResolvedValue(null);

    const { fetchSetPlacement } = await import("./actions");
    expect(await fetchSetPlacement(USER_B, SET_1)).toEqual({ rank: null });
  });
});
