import { describe, it, expect, vi, beforeEach } from "vitest";

// ────────────────────────────────────────────────────────────────
// Module mocks
// ────────────────────────────────────────────────────────────────
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/cache/revalidate", () => ({ revalidateUserProfile: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requireSignedIn: vi.fn(),
}));

// ────────────────────────────────────────────────────────────────
// Supabase chain proxy — records table + method + args so a test can
// assert WHICH tables were touched, not just that the call resolved.
// That matters here: the whole point of `clearActiveGym` is the write
// it must *not* perform.
// ────────────────────────────────────────────────────────────────
type SbError = { code?: string; message?: string; details?: string; hint?: string };
type SbResult = { data?: unknown; error?: SbError | null };
type RecordedCall = { table: string; method: string; args: unknown[] };

function makeChain(table: string, resolve: () => SbResult, calls: RecordedCall[]) {
  const builder: Record<string, unknown> = {};
  for (const m of [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "in", "order", "limit", "maybeSingle", "single",
  ]) {
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

async function primeSignedIn(supabase: unknown) {
  const { requireSignedIn } = await import("@/lib/auth");
  vi.mocked(requireSignedIn).mockResolvedValue({
    supabase: supabase as never,
    userId: USER_A,
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("clearActiveGym", () => {
  it("nulls active_gym_id for the caller", async () => {
    const { client, calls } = mockSupabase();
    await primeSignedIn(client);

    const { clearActiveGym } = await import("./membership-actions");
    const res = await clearActiveGym();

    expect(res).toEqual({ success: true, gymId: null });

    const update = calls.find((c) => c.table === "profiles" && c.method === "update");
    expect(update?.args[0]).toEqual({ active_gym_id: null });
    // Scoped to the caller — never a blanket update.
    expect(
      calls.some((c) => c.table === "profiles" && c.method === "eq" && c.args[0] === "id"),
    ).toBe(true);
  });

  it("never deletes a gym membership", async () => {
    // The load-bearing invariant. `route_logs` SELECT is gated on
    // `is_gym_member(gym_id)`, so dropping the membership would make
    // the climber's own history at that gym unreadable to them —
    // data intact, silently gone from their profile. Leaving must
    // only park the gym, never sever it.
    const { client, calls } = mockSupabase();
    await primeSignedIn(client);

    const { clearActiveGym } = await import("./membership-actions");
    await clearActiveGym();

    expect(calls.filter((c) => c.table === "gym_memberships")).toEqual([]);
  });

  it("returns the auth error when signed out", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Sign in required" } as never);

    const { clearActiveGym } = await import("./membership-actions");
    expect(await clearActiveGym()).toEqual({ error: "Sign in required" });
  });

  it("maps a Postgres failure to a friendly error", async () => {
    const { client } = mockSupabase({
      "table:profiles": { error: { code: "42501", message: "permission denied" } },
    });
    await primeSignedIn(client);

    const { clearActiveGym } = await import("./membership-actions");
    const res = await clearActiveGym();

    expect(res).toHaveProperty("error");
    // 42501 is a known code, so the raw Postgres text must not leak.
    expect((res as { error: string }).error).not.toContain("permission denied");
  });

  it("busts the profile cache so the nav drops to its gymless variant", async () => {
    const { client } = mockSupabase();
    await primeSignedIn(client);

    const { clearActiveGym } = await import("./membership-actions");
    await clearActiveGym();

    const { revalidateUserProfile } = await import("@/lib/cache/revalidate");
    expect(revalidateUserProfile).toHaveBeenCalledWith(client, USER_A);
  });
});

describe("switchActiveGym", () => {
  it("rejects a non-uuid before touching the database", async () => {
    const { client, calls } = mockSupabase();
    await primeSignedIn(client);

    const { switchActiveGym } = await import("./membership-actions");
    expect(await switchActiveGym("not-a-uuid")).toEqual({ error: "Invalid gym" });
    expect(calls).toEqual([]);
  });

  it("refuses a gym that isn't listed", async () => {
    // The lookup filters `is_listed = true`, so an unlisted gym comes
    // back as no row — indistinguishable from a bad id, and both are
    // "Gym not found" rather than leaking which.
    const { client } = mockSupabase({ "table:gyms": { data: null, error: null } });
    await primeSignedIn(client);

    const { switchActiveGym } = await import("./membership-actions");
    expect(await switchActiveGym(GYM_1)).toEqual({ error: "Gym not found" });
  });

  it("upserts a membership then repoints the active gym", async () => {
    const { client, calls } = mockSupabase({ "table:gyms": { data: { id: GYM_1 }, error: null } });
    await primeSignedIn(client);

    const { switchActiveGym } = await import("./membership-actions");
    expect(await switchActiveGym(GYM_1)).toEqual({ success: true, gymId: GYM_1 });

    const upsert = calls.find((c) => c.table === "gym_memberships" && c.method === "upsert");
    expect(upsert?.args[0]).toEqual({ user_id: USER_A, gym_id: GYM_1 });

    const update = calls.find((c) => c.table === "profiles" && c.method === "update");
    expect(update?.args[0]).toEqual({ active_gym_id: GYM_1 });
  });

  it("adds the membership with DO NOTHING, never DO UPDATE", async () => {
    // The bug this pins: `gym_memberships` has SELECT/INSERT/DELETE
    // policies and deliberately no UPDATE policy — nothing about a
    // membership is meant to change once created. A DO UPDATE upsert
    // needs both INSERT and UPDATE permission, so as soon as the row
    // already existed RLS denied the whole statement and the action
    // bailed before touching the profile.
    //
    // Net effect: switching worked once for a brand-new gym (a pure
    // INSERT) and silently failed for every gym the climber had
    // joined before — which is every gym they'd previously switched
    // to. `ignoreDuplicates` makes it ON CONFLICT DO NOTHING.
    const { client, calls } = mockSupabase({ "table:gyms": { data: { id: GYM_1 }, error: null } });
    await primeSignedIn(client);

    const { switchActiveGym } = await import("./membership-actions");
    await switchActiveGym(GYM_1);

    const upsert = calls.find((c) => c.table === "gym_memberships" && c.method === "upsert");
    expect(upsert?.args[1]).toMatchObject({ ignoreDuplicates: true });
  });

  it("keeps previous memberships when switching", async () => {
    // Switching parks the old gym rather than leaving it, for the same
    // reason clearing does — the climber keeps reading their history.
    const { client, calls } = mockSupabase({ "table:gyms": { data: { id: GYM_1 }, error: null } });
    await primeSignedIn(client);

    const { switchActiveGym } = await import("./membership-actions");
    await switchActiveGym(GYM_1);

    expect(calls.some((c) => c.table === "gym_memberships" && c.method === "delete")).toBe(false);
  });
});
