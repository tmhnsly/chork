import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSignedIn: vi.fn() }));
vi.mock("@/lib/data/mutations", () => ({ createGymMembership: vi.fn() }));

import { createMockSupabase } from "@/test/mock-supabase";

beforeEach(() => vi.resetAllMocks());

describe("completeOnboarding", () => {
  it("rejects invalid username", async () => {
    const { completeOnboarding } = await import("./actions");
    const result = await completeOnboarding("ab", "Tom", "11111111-2222-3333-4444-555555555555");
    expect(result).toHaveProperty("error");
  });

  it("rejects empty gymId", async () => {
    const { completeOnboarding } = await import("./actions");
    const result = await completeOnboarding("validuser", "Tom", "");
    expect(result).toHaveProperty("error", "Please select a gym");
  });

  it("returns error when not signed in", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    vi.mocked(requireSignedIn).mockResolvedValue({ error: "Not signed in" });

    const { completeOnboarding } = await import("./actions");
    const result = await completeOnboarding("validuser", "Tom", "11111111-2222-3333-4444-555555555555");
    expect(result).toHaveProperty("error", "Not signed in");
  });

  it("creates membership before updating profile", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const mock = createMockSupabase();
    mock._resolveWith({ data: null, error: null });
    vi.mocked(requireSignedIn).mockResolvedValue({ supabase: mock as never, userId: "u1" });

    const { createGymMembership } = await import("@/lib/data/mutations");
    vi.mocked(createGymMembership).mockResolvedValue(undefined);

    const callOrder: string[] = [];
    vi.mocked(createGymMembership).mockImplementation(async () => {
      callOrder.push("membership");
    });
    mock.update = vi.fn(() => {
      callOrder.push("profile");
      return mock;
    });
    mock._resolveWith({ data: null, error: null });

    const { completeOnboarding } = await import("./actions");
    await completeOnboarding("validuser", "Tom", "11111111-2222-3333-4444-555555555555");

    expect(callOrder[0]).toBe("membership");
  });

  it("rolls back membership on profile update failure", async () => {
    const { requireSignedIn } = await import("@/lib/auth");
    const mock = createMockSupabase();
    vi.mocked(requireSignedIn).mockResolvedValue({ supabase: mock as never, userId: "u1" });

    const { createGymMembership } = await import("@/lib/data/mutations");
    vi.mocked(createGymMembership).mockResolvedValue(undefined);

    // Profile update fails
    mock._resolveWith({ data: null, error: { message: "profile error", code: "500" } });

    const { completeOnboarding } = await import("./actions");
    const result = await completeOnboarding("validuser", "Tom", "11111111-2222-3333-4444-555555555555");

    expect(result).toHaveProperty("error");
    // Verify delete was called for rollback
    expect(mock.delete).toHaveBeenCalled();
  });
});
