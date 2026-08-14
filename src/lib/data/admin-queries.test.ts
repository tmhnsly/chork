/**
 * Admin-side queries — covers isGymAdminOf, the cheap single-gym
 * admin gate that replaces the cosmetic gym_memberships.role check.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, type SbResult } from "@/test/mock-supabase";

function scriptedSupabase(result: SbResult) {
  return createMockSupabase({ "table:gym_admins": result });
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("isGymAdminOf", () => {
  it("returns true when an admin row exists for (userId, gymId)", async () => {
    const sb = scriptedSupabase({ data: { user_id: USER_A }, error: null });
    const { isGymAdminOf } = await import("./admin-queries");
    expect(await isGymAdminOf(sb as never, USER_A, GYM_1)).toBe(true);
  });

  it("returns false when no admin row exists", async () => {
    const sb = scriptedSupabase({ data: null, error: null });
    const { isGymAdminOf } = await import("./admin-queries");
    expect(await isGymAdminOf(sb as never, USER_A, GYM_1)).toBe(false);
  });

  it("returns false on DB error (defensive — never fail-open)", async () => {
    const sb = scriptedSupabase({ data: null, error: { code: "x", message: "y" } });
    const { isGymAdminOf } = await import("./admin-queries");
    expect(await isGymAdminOf(sb as never, USER_A, GYM_1)).toBe(false);
  });
});
