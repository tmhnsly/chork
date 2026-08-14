/**
 * revalidateUserProfile bridges the uid → username gap so mutations
 * that only know a userId still bust getProfileByUsername's cache
 * entry (tagged user:username-{u}:profile — the only profile surface
 * with a cachedQuery reader; see the reader-first rule in tags.ts).
 *
 * These tests assert the contract:
 *  - looks up the username in profiles
 *  - busts user:username-{u}:profile when the lookup yields one
 *  - busts nothing (and logs) when the lookup fails or yields nothing
 *
 * revalidateRouteLogTags owns the "what a route-log write invalidates"
 * seam: today that is the set leaderboard alone, conditional on setId.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createMockSupabase, type SbResult } from "@/test/mock-supabase";

function scriptedSupabase(result: SbResult) {
  return createMockSupabase({ "table:profiles": result });
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const SET_1 = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("revalidateUserProfile", () => {
  it("busts the by-username tag when the lookup succeeds", async () => {
    const sb = scriptedSupabase({ data: { username: "alice" }, error: null });
    const { revalidateTag } = await import("next/cache");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    expect(revalidateTag).toHaveBeenCalledWith("user:username-alice:profile", "max");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("busts nothing when no profile row exists", async () => {
    const sb = scriptedSupabase({ data: null, error: null });
    const { revalidateTag } = await import("next/cache");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("logs (not swallows) a failed lookup and busts nothing", async () => {
    const sb = scriptedSupabase({ data: null, error: { code: "x", message: "y" } });
    const { revalidateTag } = await import("next/cache");
    const { logger } = await import("@/lib/logger");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    // The silent-swallow variant left a stale /u page with zero log
    // evidence — pin the log line.
    expect(logger.warn).toHaveBeenCalledWith(
      "revalidate_user_profile_username_lookup_failed",
      expect.anything(),
    );
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("revalidateRouteLogTags", () => {
  it("busts the set leaderboard when the log has a set", async () => {
    const { revalidateTag } = await import("next/cache");
    const { revalidateRouteLogTags } = await import("./revalidate");

    revalidateRouteLogTags(SET_1, USER_A);

    expect(revalidateTag).toHaveBeenCalledWith(`set:${SET_1}:leaderboard`, "max");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("busts nothing when the log has no set (helper owns the conditional)", async () => {
    const { revalidateTag } = await import("next/cache");
    const { revalidateRouteLogTags } = await import("./revalidate");

    revalidateRouteLogTags(null, USER_A);

    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
