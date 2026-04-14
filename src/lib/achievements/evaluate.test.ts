/**
 * `evaluateAndPersistAchievements` — the post-`completeRoute` hook.
 * Pinning the contract that:
 *   • it never throws (achievement writes must not break logging);
 *   • it skips the upsert when no badges have been earned;
 *   • it upserts every earned badge with `ignoreDuplicates` so a
 *     repeat earn doesn't reset the original `earned_at`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BadgeContext } from "@/lib/badges";

const upsertSpy = vi.fn();

function makeChain() {
  const builder: Record<string, unknown> = {};
  const chain = (...args: unknown[]) => {
    upsertSpy(...args);
    return builder;
  };
  builder.upsert = chain;
  builder.then = (onFulfilled: (v: { error: null | { message: string } }) => unknown) =>
    Promise.resolve({ error: null }).then(onFulfilled);
  return builder;
}

const supabase = {
  from: (_table: string) => makeChain(),
};

const USER_A = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  upsertSpy.mockClear();
});

const baseCtx: BadgeContext = {
  totalFlashes: 0,
  totalSends: 0,
  totalPoints: 0,
  completedRoutesBySet: new Map(),
  totalRoutesBySet: new Map(),
  flashedRoutesBySet: new Map(),
  zoneAvailableBySet: new Map(),
  zoneClaimedBySet: new Map(),
};

describe("evaluateAndPersistAchievements", () => {
  it("returns silently and skips upsert when no badges are earned", async () => {
    const { evaluateAndPersistAchievements } = await import("./evaluate");
    await evaluateAndPersistAchievements(supabase as never, USER_A, baseCtx);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("upserts every earned badge keyed by (user_id, badge_id) with ignoreDuplicates", async () => {
    const { evaluateAndPersistAchievements } = await import("./evaluate");
    // First flash + first send → triggers two earned badges.
    await evaluateAndPersistAchievements(supabase as never, USER_A, {
      ...baseCtx,
      totalFlashes: 1,
      totalSends: 1,
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsertSpy.mock.calls[0];
    expect(opts).toEqual({ onConflict: "user_id,badge_id", ignoreDuplicates: true });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: USER_A, badge_id: "flash-thundershock" }),
        expect.objectContaining({ user_id: USER_A, badge_id: "first-ascend" }),
      ]),
    );
  });

  it("never throws even if the supabase call rejects", async () => {
    const throwing = {
      from: () => {
        throw new Error("boom");
      },
    };
    const { evaluateAndPersistAchievements } = await import("./evaluate");
    await expect(
      evaluateAndPersistAchievements(throwing as never, USER_A, baseCtx),
    ).resolves.toBeUndefined();
  });
});
