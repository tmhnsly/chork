/**
 * Admin-side queries — covers isGymAdminOf, the cheap single-gym
 * admin gate that replaces the cosmetic gym_memberships.role check.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type SbResult = { data?: unknown; error?: unknown };

function scriptedSupabase(result: SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  for (const m of ["from", "select", "eq", "maybeSingle", "order"]) {
    (builder[m] as unknown) = chain;
  }
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return {
    from: () => builder,
  };
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
