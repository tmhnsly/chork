/**
 * User profile server actions — smoke + validation tests.
 * `updateProfile` and `updateThemePreference` are the climber-
 * facing writers; both gate behind `requireAuth` and validate
 * input before touching the DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./auth", () => ({
  requireAuth: vi.fn(),
  requireSignedIn: vi.fn(),
}));
vi.mock("./supabase/server", () => ({
  createServiceClient: vi.fn(),
}));
vi.mock("./validation", () => ({
  validateUsername: vi.fn(() => ({ error: null })),
}));

type SbResult = { data?: unknown; error?: unknown };

function makeChain(resolve: () => SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  const methods = ["select", "update", "eq", "neq", "limit"];
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

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────
// updateProfile
// ────────────────────────────────────────────────────────────────
describe("updateProfile", () => {
  it("surfaces auth failure", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" });
    const { updateProfile } = await import("./user-actions");
    expect(await updateProfile({ name: "Tom" })).toEqual({ error: "Not signed in" });
  });

  it("rejects empty updates", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase() as never,
      userId: USER_A,
      gymId: "g1",
    });
    const { updateProfile } = await import("./user-actions");
    expect(await updateProfile({})).toEqual({ error: "Nothing to update" });
  });

  it("rejects non-string names", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase() as never,
      userId: USER_A,
      gymId: "g1",
    });
    const { updateProfile } = await import("./user-actions");
    expect(
      await updateProfile({ name: 123 as unknown as string }),
    ).toEqual({ error: "Invalid name" });
  });
});

// ────────────────────────────────────────────────────────────────
// updateThemePreference
// ────────────────────────────────────────────────────────────────
describe("updateThemePreference", () => {
  it("rejects non-string themes", async () => {
    const { updateThemePreference } = await import("./user-actions");
    expect(
      await updateThemePreference(123 as unknown as string),
    ).toEqual({ error: "Invalid theme" });
  });

  it("rejects themes longer than 32 chars (defensive bound)", async () => {
    const { updateThemePreference } = await import("./user-actions");
    expect(
      await updateThemePreference("x".repeat(33)),
    ).toEqual({ error: "Invalid theme" });
  });

  it("surfaces auth failure", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" });
    const { updateThemePreference } = await import("./user-actions");
    expect(await updateThemePreference("slate")).toEqual({
      error: "Not signed in",
    });
  });

  it("writes the theme on success", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase({
        "table:profiles": { data: null, error: null },
      }) as never,
      userId: USER_A,
      gymId: "g1",
    });
    const { updateThemePreference } = await import("./user-actions");
    expect(await updateThemePreference("sand")).toEqual({ success: true });
  });
});
