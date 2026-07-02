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
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
const USER_B = "22222222-2222-2222-2222-222222222222";
const CREW_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.resetAllMocks();
});

// revalidateCrewMembers owns the crew fan-out invariant: bust
// crew:{id} + every active member's userCrews tag, deduped, with
// extraUserIds covering users no longer present in crew_members
// (leavers, removals, decliners). A failed member fetch must be
// LOGGED (not swallowed) and must not block the extraUserIds busts.
describe("revalidateCrewMembers", () => {
  it("busts crew tag + each active member's userCrews, deduped", async () => {
    const sb = scriptedSupabase({
      data: [
        { user_id: USER_A },
        { user_id: USER_A }, // duplicate row — must bust only once
        { user_id: USER_B },
      ],
      error: null,
    });
    const { revalidateTag } = await import("next/cache");
    const { revalidateCrewMembers } = await import("./revalidate");

    await revalidateCrewMembers(sb as never, CREW_1);

    const calls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);
    expect(calls).toContain(`crew:${CREW_1}`);
    expect(calls).toContain(`user:${USER_A}:crews`);
    expect(calls).toContain(`user:${USER_B}:crews`);
    expect(calls).toHaveLength(3);
  });

  it("busts extraUserIds not present in the roster, without double-busting members", async () => {
    const sb = scriptedSupabase({ data: [{ user_id: USER_A }], error: null });
    const { revalidateTag } = await import("next/cache");
    const { revalidateCrewMembers } = await import("./revalidate");

    // USER_A is both a member and an extra id — must still bust once.
    await revalidateCrewMembers(sb as never, CREW_1, [USER_B, USER_A]);

    const calls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);
    expect(calls).toContain(`user:${USER_A}:crews`);
    expect(calls).toContain(`user:${USER_B}:crews`);
    expect(calls).toHaveLength(3); // crew + A + B
  });

  it("logs a failed member fetch and still busts crew + extraUserIds", async () => {
    const sb = scriptedSupabase({
      data: null,
      error: { code: "57014", message: "canceling statement" },
    });
    const { revalidateTag } = await import("next/cache");
    const { logger } = await import("@/lib/logger");
    const { revalidateCrewMembers } = await import("./revalidate");

    await revalidateCrewMembers(sb as never, CREW_1, [USER_A]);

    // The silent-swallow variant of this helper left stale /crew/[id]
    // pages with zero log evidence — pin the log line.
    expect(logger.warn).toHaveBeenCalledWith(
      "revalidateCrewMembers_failed",
      expect.objectContaining({ crewId: CREW_1 }),
    );
    const calls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);
    expect(calls).toContain(`crew:${CREW_1}`);
    expect(calls).toContain(`user:${USER_A}:crews`);
  });
});

describe("revalidateUserProfile", () => {
  it("always busts user:{uid}:profile, plus username tag when lookup succeeds", async () => {
    const sb = scriptedSupabase({ data: { username: "alice" }, error: null });
    const { revalidateTag } = await import("next/cache");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    expect(revalidateTag).toHaveBeenCalledWith(`user:${USER_A}:profile`, "max");
    expect(revalidateTag).toHaveBeenCalledWith("user:username-alice:profile", "max");
  });

  it("only busts user:{uid}:profile when no profile row exists", async () => {
    const sb = scriptedSupabase({ data: null, error: null });
    const { revalidateTag } = await import("next/cache");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    expect(revalidateTag).toHaveBeenCalledWith(`user:${USER_A}:profile`, "max");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("only busts user:{uid}:profile when the lookup errors", async () => {
    const sb = scriptedSupabase({ data: null, error: { code: "x", message: "y" } });
    const { revalidateTag } = await import("next/cache");
    const { revalidateUserProfile } = await import("./revalidate");

    await revalidateUserProfile(sb as never, USER_A);

    // Errors logged elsewhere; bust still fires for the uid tag so a
    // by-uid cache entry (when that wrap exists) doesn't go stale.
    expect(revalidateTag).toHaveBeenCalledWith(`user:${USER_A}:profile`, "max");
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });
});
