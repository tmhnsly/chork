/**
 * Account server actions — smoke + validation tests.
 * Every writer gates behind `gateSignedInMutation` (gymless-safe —
 * see the module header) and validates input before touching the DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("@/test/mock-auth")).mockAuthModule());
vi.mock("@/lib/cache/revalidate", () => ({ revalidateUserProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));
// Partial: `UUID_RE` stays real for the auth double's id check.
vi.mock(import("@/lib/validation"), async (importOriginal) => ({
  ...(await importOriginal()),
  validateUsername: vi.fn(() => ({})),
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
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { updateProfile } = await import("./actions");
    expect(await updateProfile({ name: "Tom" })).toEqual({ error: "Not signed in" });
  });

  it("rejects empty updates", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: createMockSupabase() as never,
      userId: USER_A,
    });
    const { updateProfile } = await import("./actions");
    expect(await updateProfile({})).toEqual({ error: "Nothing to update" });
  });

  it("rejects non-string names", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: createMockSupabase() as never,
      userId: USER_A,
    });
    const { updateProfile } = await import("./actions");
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
    const { updateThemePreference } = await import("./actions");
    expect(
      await updateThemePreference(123 as unknown as string),
    ).toEqual({ error: "Invalid theme" });
  });

  it("rejects themes longer than 32 chars (defensive bound)", async () => {
    const { updateThemePreference } = await import("./actions");
    expect(
      await updateThemePreference("x".repeat(33)),
    ).toEqual({ error: "Invalid theme" });
  });

  it("surfaces auth failure", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { updateThemePreference } = await import("./actions");
    expect(await updateThemePreference("slate")).toEqual({
      error: "Not signed in",
    });
  });

  it("writes the theme on success", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: createMockSupabase({
        "table:profiles": { data: null, error: null },
      }) as never,
      userId: USER_A,
    });
    const { updateThemePreference } = await import("./actions");
    expect(await updateThemePreference("sand")).toEqual({ success: true });
  });
});

// ────────────────────────────────────────────────────────────────
// updatePushCategory
// ────────────────────────────────────────────────────────────────
describe("updatePushCategory", () => {
  it("rejects unknown categories", async () => {
    const { updatePushCategory } = await import("./actions");
    expect(await updatePushCategory("not_a_category", true)).toEqual({
      error: "Unknown notification category",
    });
  });

  it("rejects non-boolean values", async () => {
    const { updatePushCategory } = await import("./actions");
    expect(
      await updatePushCategory("invite_received", "yes" as unknown as boolean),
    ).toEqual({ error: "Invalid value" });
  });

  it("surfaces auth failure", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });
    const { updatePushCategory } = await import("./actions");
    expect(await updatePushCategory("invite_received", true)).toEqual({
      error: "Not signed in",
    });
  });

  it("writes the flag on success for every known category", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: createMockSupabase({
        "table:profiles": { data: null, error: null },
      }) as never,
      userId: USER_A,
    });
    const { updatePushCategory } = await import("./actions");
    for (const category of ["invite_received", "invite_accepted", "ownership_changed"]) {
      expect(await updatePushCategory(category, false)).toEqual({ success: true });
      expect(await updatePushCategory(category, true)).toEqual({ success: true });
    }
  });

  it("propagates DB errors", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({
      supabase: createMockSupabase({
        "table:profiles": { data: null, error: { code: "42501", message: "nope" } },
      }) as never,
      userId: USER_A,
    });
    const { updatePushCategory } = await import("./actions");
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
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" } as never);
    const { deleteAccount } = await import("./actions");
    expect(await deleteAccount()).toEqual({ error: "Not signed in" });
  });

  it("busts the by-username profile cache around the delete", async () => {
    // Without this, /u/{username} kept serving the deleted climber
    // for the TTL plus one stale render — and could serve it to the
    // handle's NEXT owner. Before (the lookup needs the row) and after
    // (a request in between could re-cache it).
    const { requireSignedIn } = await import("@/lib/auth");
    const sb = createMockSupabase({ "table:profiles": { data: { username: "gone" } } });
    vi.mocked(requireSignedIn).mockResolvedValue({ supabase: sb, userId: USER_A } as never);
    const { createServiceClient } = await import("@/lib/supabase/server");
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServiceClient).mockReturnValue({ auth: { admin: { deleteUser } } } as never);

    const { revalidateTag } = await import("next/cache");
    const { deleteAccount } = await import("./actions");
    expect(await deleteAccount()).toEqual({ success: true });

    expect(deleteUser).toHaveBeenCalledWith(USER_A);
    const busts = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);
    expect(busts.filter((t) => t === "user:username-gone:profile")).toHaveLength(2);
    // Order: one bust before the delete, one after.
    const order = vi.mocked(revalidateTag).mock.invocationCallOrder;
    const del = deleteUser.mock.invocationCallOrder[0];
    expect(order[0]).toBeLessThan(del);
    expect(order[1]).toBeGreaterThan(del);
  });

  it("still deletes when the profile row is already gone — nothing to bust", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const sb = createMockSupabase({ "table:profiles": { data: null } });
    vi.mocked(requireSignedIn).mockResolvedValue({ supabase: sb, userId: USER_A } as never);
    const { createServiceClient } = await import("@/lib/supabase/server");
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServiceClient).mockReturnValue({ auth: { admin: { deleteUser } } } as never);
    const { revalidateTag } = await import("next/cache");
    const { deleteAccount } = await import("./actions");
    expect(await deleteAccount()).toEqual({ success: true });
    expect(vi.mocked(revalidateTag)).not.toHaveBeenCalled();
  });
});
