/**
 * User profile server actions — smoke + validation tests.
 * `updateProfile` and `updateThemePreference` are the climber-
 * facing writers; both gate behind `requireAuth` and validate
 * input before touching the DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
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

// ────────────────────────────────────────────────────────────────
// updatePushCategory
// ────────────────────────────────────────────────────────────────
describe("updatePushCategory", () => {
  it("rejects unknown categories", async () => {
    const { updatePushCategory } = await import("./user-actions");
    expect(await updatePushCategory("not_a_category", true)).toEqual({
      error: "Unknown notification category",
    });
  });

  it("rejects non-boolean values", async () => {
    const { updatePushCategory } = await import("./user-actions");
    expect(
      await updatePushCategory("invite_received", "yes" as unknown as boolean),
    ).toEqual({ error: "Invalid value" });
  });

  it("surfaces auth failure", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" });
    const { updatePushCategory } = await import("./user-actions");
    expect(await updatePushCategory("invite_received", true)).toEqual({
      error: "Not signed in",
    });
  });

  it("writes the flag on success for every known category", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase({
        "table:profiles": { data: null, error: null },
      }) as never,
      userId: USER_A,
      gymId: "g1",
    });
    const { updatePushCategory } = await import("./user-actions");
    for (const category of ["invite_received", "invite_accepted", "ownership_changed"]) {
      expect(await updatePushCategory(category, false)).toEqual({ success: true });
      expect(await updatePushCategory(category, true)).toEqual({ success: true });
    }
  });

  it("propagates DB errors", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: mockSupabase({
        "table:profiles": { data: null, error: { code: "42501", message: "nope" } },
      }) as never,
      userId: USER_A,
      gymId: "g1",
    });
    const { updatePushCategory } = await import("./user-actions");
    expect(await updatePushCategory("invite_received", true)).toEqual({
      error: "nope",
    });
  });
});
