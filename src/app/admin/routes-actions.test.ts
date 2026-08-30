/**
 * Route server actions — the number range + tag ceiling, behind the
 * resource gate. Moved out of the admin barrel test when the barrel
 * went.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/auth", async () => (await import("@/test/mock-auth")).mockAuthModule());
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

const USER_A = "11111111-1111-1111-1111-111111111111";
const GYM_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SET_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ROUTE_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("updateRoute", () => {
  it("rejects malformed route ids", async () => {
    const { requireAdminOfRoute } = await import("@/lib/auth");
    vi.mocked(requireAdminOfRoute).mockResolvedValueOnce({
      error: "Invalid route.",
      reason: "invalid",
    });
    const { updateRoute } = await import("./routes-actions");
    expect(await updateRoute("nope", {})).toEqual({ error: "Invalid route." });
  });

  it("rejects route numbers outside 1..999", async () => {
    // requireAdminOfRoute returns {auth, routeRow} only when the route
    // exists + the caller admins its gym. Mock that successful gate
    // here so the action proceeds to the number-range check.
    const { requireAdminOfRoute } = await import("@/lib/auth");
    vi.mocked(requireAdminOfRoute).mockResolvedValueOnce({
      auth: {
        supabase: createMockSupabase() as never,
        userId: USER_A,
        gymId: GYM_1,
        isOwner: true,
      },
      routeRow: { id: ROUTE_1, set_id: SET_1, gym_id: GYM_1 },
    });
    const { updateRoute } = await import("./routes-actions");
    expect(await updateRoute(ROUTE_1, { number: 1000 })).toEqual({
      error: "Route number must be between 1 and 999.",
    });
  });
});

// ────────────────────────────────────────────────────────────────
// updateSet — the most consequential admin mutation, and until
// 2026-08 the only untested one. Its go-live branch guards the Wall
// (route-count check + incumbent demote + Announcement fan-out) and
// its patch builder decides what a "Save changes" actually writes.
// ────────────────────────────────────────────────────────────────
