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

import { createMockSupabase } from "@/test/mock-supabase";

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
      supabase: createMockSupabase() as never,
      userId: USER_A,
      gymId: "g1",
    });
    const { updateProfile } = await import("./user-actions");
    expect(await updateProfile({})).toEqual({ error: "Nothing to update" });
  });

  it("rejects non-string names", async () => {
    const { requireAuth } = await import("./auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: createMockSupabase() as never,
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
      supabase: createMockSupabase({
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
      supabase: createMockSupabase({
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
      supabase: createMockSupabase({
        "table:profiles": { data: null, error: { code: "42501", message: "nope" } },
      }) as never,
      userId: USER_A,
      gymId: "g1",
    });
    const { updatePushCategory } = await import("./user-actions");
    expect(await updatePushCategory("invite_received", true)).toEqual({
      error: "You don't have permission to do that.",
    });
  });
});

// ────────────────────────────────────────────────────────────────
// deleteAccount
// ────────────────────────────────────────────────────────────────
describe("deleteAccount", () => {
  it("surfaces auth failure", async () => {
    const { requireSignedIn } = await import("./auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" } as never);
    const { deleteAccount } = await import("./user-actions");
    expect(await deleteAccount()).toEqual({ error: "Not signed in" });
  });

  it("hands an owned crew to its longest-standing active member before deleting the account", async () => {
    const HEIR = "22222222-2222-2222-2222-222222222222";
    const CREW = "33333333-3333-3333-3333-333333333333";
    const { requireSignedIn } = await import("./auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ userId: USER_A } as never);

    // crews SELECT → one owned crew; crew_members lookup → the heir.
    const service = createMockSupabase({
      "table:crews": { data: [{ id: CREW }] },
      "table:crew_members": { data: { user_id: HEIR } },
    });
    service.auth.admin.deleteUser.mockResolvedValue({ error: null });
    const { createServiceClient } = await import("./supabase/server");
    vi.mocked(createServiceClient).mockReturnValue(service as never);

    const { deleteAccount } = await import("./user-actions");
    expect(await deleteAccount()).toEqual({ success: true });

    // Invariant: ownership is transferred to the heir, and only THEN is
    // the account deleted — otherwise the cascade wipes the crew for all.
    expect(
      service.calls.some(
        (c) =>
          c.source === "crews" &&
          c.method === "update" &&
          (c.args[0] as { created_by?: string })?.created_by === HEIR,
      ),
    ).toBe(true);
    expect(service.auth.admin.deleteUser).toHaveBeenCalledWith(USER_A);
  });
});
