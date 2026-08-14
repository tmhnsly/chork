/**
 * signupGym — the create_gym_with_owner_tx RPC contract, pinned at
 * the action's real interface. Migration 062 reordered the function
 * so p_city / p_country trail p_plan_tier with DEFAULT NULL; the
 * action must omit them (not send null) when blank so the DB-side
 * defaults apply.
 *
 * (Ported from admin-mutations.test.ts when the pass-through
 * mutation layer was inlined into the actions, 2026-08. Barrel-level
 * validation + auth tests live in actions.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

vi.mock("@/lib/auth", () => ({ requireSignedIn: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforce: vi.fn() }));

const USER_A = "11111111-1111-1111-1111-111111111111";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const baseForm = {
  name: "Yonder",
  slug: "yonder",
  city: "London",
  country: "GB",
  planTier: "starter" as const,
};

beforeEach(async () => {
  vi.resetAllMocks();
  const { enforce } = await import("@/lib/rate-limit");
  vi.mocked(enforce).mockResolvedValue({ ok: true });
});

async function primeSignedIn(
  primed: Parameters<typeof createMockSupabase>[0] = {},
) {
  const sb = createMockSupabase(primed);
  const { requireSignedIn } = await import("@/lib/auth");
  vi.mocked(requireSignedIn).mockResolvedValue({
    supabase: sb as never,
    userId: USER_A,
  });
  return sb;
}

describe("signupGym", () => {
  it("returns a friendly message when the slug is already taken (PG 23505)", async () => {
    await primeSignedIn({
      "rpc:create_gym_with_owner_tx": {
        data: null,
        error: { code: "23505", message: "dup" },
      },
    });
    const { signupGym } = await import("./gym-actions");
    expect(await signupGym(baseForm)).toEqual({
      error: "That gym slug is already taken.",
    });
  });

  it("maps non-collision failures through formatError (no raw message leak)", async () => {
    await primeSignedIn({
      "rpc:create_gym_with_owner_tx": {
        data: null,
        error: { code: "42501", message: "rls internals here" },
      },
    });
    const { signupGym } = await import("./gym-actions");
    expect(await signupGym(baseForm)).toEqual({
      error: "You don't have permission to do that.",
    });
  });

  it("pins the RPC contract — function name + arg shape", async () => {
    const sb = await primeSignedIn({
      "rpc:create_gym_with_owner_tx": { data: GYM_1, error: null },
    });
    const { signupGym } = await import("./gym-actions");
    expect(await signupGym(baseForm)).toEqual({ success: true, gymId: GYM_1 });

    const rpcCall = sb.calls.find(
      (c) => c.source === "create_gym_with_owner_tx" && c.method === "rpc",
    );
    expect(rpcCall?.args).toEqual([
      {
        p_name: "Yonder",
        p_slug: "yonder",
        p_plan_tier: "starter",
        p_city: "London",
        p_country: "GB",
      },
    ]);
  });

  it("omits p_city / p_country when blank so DB defaults apply", async () => {
    const sb = await primeSignedIn({
      "rpc:create_gym_with_owner_tx": { data: GYM_1, error: null },
    });
    const { signupGym } = await import("./gym-actions");
    await signupGym({ ...baseForm, city: "", country: "  " });

    const rpcCall = sb.calls.find(
      (c) => c.source === "create_gym_with_owner_tx" && c.method === "rpc",
    );
    expect(rpcCall?.args).toEqual([
      {
        p_name: "Yonder",
        p_slug: "yonder",
        p_plan_tier: "starter",
      },
    ]);
  });
});
