/**
 * revalidateUserProfile bridges the uid → username gap so mutations
 * that only know a userId still bust getProfileByUsername's cache
 * entry (tagged user:username-{u}:profile, not user:{uid}:profile).
 *
 * These tests assert the contract:
 *  - always busts user:{uid}:profile
 *  - looks up the username in profiles
 *  - busts user:username-{u}:profile when the lookup yields one
 *  - does NOT bust the username tag when the lookup returns nothing
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

type SbResult = { data?: unknown; error?: unknown };

function scriptedSupabase(result: SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  for (const m of ["from", "select", "eq", "maybeSingle"]) {
    (builder[m] as unknown) = chain;
  }
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return {
    from: () => builder,
  };
}

const USER_A = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("revalidateUserProfile", () => {
  it("always busts user:{uid}:profile, plus username tag when lookup succeeds", async () => {
    const sb = scriptedSupabase({ data: { username: "alice" }, error: null });
    const { revalidateTag } = await import("next/cache");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    expect(revalidateTag).toHaveBeenCalledWith(`user:${USER_A}:profile`);
    expect(revalidateTag).toHaveBeenCalledWith("user:username-alice:profile");
  });

  it("only busts user:{uid}:profile when no profile row exists", async () => {
    const sb = scriptedSupabase({ data: null, error: null });
    const { revalidateTag } = await import("next/cache");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    expect(revalidateTag).toHaveBeenCalledWith(`user:${USER_A}:profile`);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("only busts user:{uid}:profile when the lookup errors", async () => {
    const sb = scriptedSupabase({ data: null, error: { code: "x", message: "y" } });
    const { revalidateTag } = await import("next/cache");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    // Errors logged elsewhere; bust still fires for the uid tag so a
    // by-uid cache entry (when that wrap exists) doesn't go stale.
    expect(revalidateTag).toHaveBeenCalledWith(`user:${USER_A}:profile`);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });
});
