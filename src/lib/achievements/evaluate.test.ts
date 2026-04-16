/**
 * `evaluateAndPersistAchievements` — the post-`completeRoute` hook.
 * Pinning the contract that:
 *   • it never throws (achievement writes must not break logging);
 *   • it skips the upsert when no badges have been earned;
 *   • it pre-fetches the user's existing badges to compute the diff,
 *     only upserts the NEW ones (so the timestamp reflects FIRST earn),
 *     and returns those new BadgeDefinition[] for the client toast.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BadgeContext } from "@/lib/badges";

const upsertSpy = vi.fn();
let existingBadgeIds: string[] = [];

function makeFromChain(table: string) {
  // The evaluator does two ops on `user_achievements`:
  //   1. SELECT badge_id WHERE user_id = $1   (existing-row prefetch)
  //   2. UPSERT rows                           (persist new earns)
  // The mock returns a thenable that resolves with the right shape
  // depending on which method was last invoked.
  let mode: "select" | "upsert" | null = null;
  const builder: Record<string, unknown> = {};
  builder.select = () => {
    mode = "select";
    return builder;
  };
  builder.eq = () => builder;
  builder.upsert = (...args: unknown[]) => {
    mode = "upsert";
    upsertSpy(...args);
    return builder;
  };
  builder.then = (
    onFulfilled: (v: { data?: unknown; error: null | { message: string } }) => unknown,
  ) => {
    if (mode === "select") {
      return Promise.resolve({
        data: existingBadgeIds.map((id) => ({ badge_id: id })),
        error: null,
      }).then(onFulfilled);
    }
    return Promise.resolve({ data: null, error: null }).then(onFulfilled);
  };
  // Reference table so the closure binds it (silences the unused-arg
  // hint without changing the test).
  void table;
  return builder;
}

const supabase = {
  from: (table: string) => makeFromChain(table),
};

const USER_A = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  upsertSpy.mockClear();
  existingBadgeIds = [];
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
  it("returns [] and skips upsert when no badges are earned", async () => {
    const { evaluateAndPersistAchievements } = await import("./evaluate");
    const result = await evaluateAndPersistAchievements(supabase as never, USER_A, baseCtx);
    expect(result).toEqual([]);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("upserts + returns only NEWLY-earned badges (diffs against existing rows)", async () => {
    // Climber already has the first-flash badge — it should NOT
    // appear in the diff and the upsert payload should only carry
    // the new first-send badge.
    existingBadgeIds = ["flash-thundershock"];

    const { evaluateAndPersistAchievements } = await import("./evaluate");
    const result = await evaluateAndPersistAchievements(supabase as never, USER_A, {
      ...baseCtx,
      totalFlashes: 1,
      totalSends: 1,
    });

    const ids = result.map((b) => b.id);
    expect(ids).toEqual(["first-ascend"]);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsertSpy.mock.calls[0];
    expect(opts).toEqual({ onConflict: "user_id,badge_id", ignoreDuplicates: true });
    expect(rows).toEqual([
      expect.objectContaining({ user_id: USER_A, badge_id: "first-ascend" }),
    ]);
  });

  it("returns [] and skips upsert when every earned badge was already persisted", async () => {
    existingBadgeIds = ["flash-thundershock", "first-ascend"];

    const { evaluateAndPersistAchievements } = await import("./evaluate");
    const result = await evaluateAndPersistAchievements(supabase as never, USER_A, {
      ...baseCtx,
      totalFlashes: 1,
      totalSends: 1,
    });
    expect(result).toEqual([]);
    expect(upsertSpy).not.toHaveBeenCalled();
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
    ).resolves.toEqual([]);
  });
});
