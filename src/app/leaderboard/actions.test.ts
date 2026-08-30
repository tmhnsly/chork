/**
 * Leaderboard server actions — validation + cross-gym access gate.
 * `fetchClimberSheetLogs` is the one with real security impact
 * (could leak another gym's logs if the set-belongs-to-gym check
 * broke), so that action gets the heaviest coverage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

// Partial mock: requireAuth is stubbed per-test, but requireSameGymScope
// stays REAL so the cross-gym security gate below is exercised, not
// mocked away.
vi.mock(import("@/lib/auth"), async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/data/route-log-queries", () => ({
  getLogsBySetForUser: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/data/leaderboard-queries", () => ({
  getLeaderboardCached: vi.fn(() => Promise.resolve([])),
  getLeaderboardTabData: vi.fn(() =>
    Promise.resolve({ top: [], userRow: null, neighbourhood: [] }),
  ),
}));

const USER_A = "11111111-1111-1111-1111-111111111111";
const GYM_OWN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GYM_OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SET_SAME = "cccccccc-cccc-cccc-cccc-cccccccccccc";

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────
// fetchLeaderboardTab
// ────────────────────────────────────────────────────────────────
describe("fetchLeaderboardTab", () => {
  it("surfaces auth failure", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" });
    const { fetchLeaderboardTab } = await import("./actions");
    expect(await fetchLeaderboardTab(null)).toEqual({ error: "Not signed in" });
  });

  it("returns an empty-ish tab when auth succeeds but data is empty", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: createMockSupabase() as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { fetchLeaderboardTab } = await import("./actions");
    const result = await fetchLeaderboardTab(null);
    expect(result).toEqual({
      success: true,
      data: { top: [], userRow: null, neighbourhood: [] },
    });
  });
});

// ────────────────────────────────────────────────────────────────
// fetchLeaderboardPage
// ────────────────────────────────────────────────────────────────
describe("fetchLeaderboardPage", () => {
  it("surfaces auth failure", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" });
    const { fetchLeaderboardPage } = await import("./actions");
    expect(await fetchLeaderboardPage(null, 0)).toEqual({
      error: "Not signed in",
    });
  });

  it("includes the paging limit on success so the caller knows the step", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: createMockSupabase() as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { fetchLeaderboardPage } = await import("./actions");
    const result = await fetchLeaderboardPage(null, 0);
    if ("error" in result) throw new Error("expected success");
    expect(result.limit).toBeGreaterThan(0);
    expect(result.rows).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────
// fetchClimberSheetLogs — security-critical
// ────────────────────────────────────────────────────────────────
describe("fetchClimberSheetLogs", () => {
  it("rejects malformed user ids", async () => {
    const { fetchClimberSheetLogs } = await import("./actions");
    expect(await fetchClimberSheetLogs("nope", SET_SAME)).toEqual({
      error: "Invalid request",
    });
  });

  it("rejects malformed set ids", async () => {
    const { fetchClimberSheetLogs } = await import("./actions");
    expect(await fetchClimberSheetLogs(USER_A, "nope")).toEqual({
      error: "Invalid request",
    });
  });

  it("surfaces auth failure", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({ error: "Not signed in" });
    const { fetchClimberSheetLogs } = await import("./actions");
    expect(await fetchClimberSheetLogs(USER_A, SET_SAME)).toEqual({
      error: "Not signed in",
    });
  });

  it("rejects a set that belongs to a DIFFERENT gym — no cross-gym leak", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: createMockSupabase({
        "table:sets": { data: { owner_kind: "gym", gym_id: GYM_OTHER } },
      }) as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { fetchClimberSheetLogs } = await import("./actions");
    expect(await fetchClimberSheetLogs(USER_A, SET_SAME)).toEqual({
      error: "Set not found",
    });
  });

  // Regression: a target user that is NOT a member of the caller's
  // gym must be rejected even if the set's gym_id passes the first
  // check. Without this gate, a gym-A caller could enumerate gym-B
  // climber UUIDs over a set that happens to share a gym_id, leaking
  // their sanitised logs.
  it("rejects a target climber who is not a member of the caller's gym", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: createMockSupabase({
        "table:sets": { data: { owner_kind: "gym", gym_id: GYM_OWN } },
        "table:gym_memberships": { data: null },
      }) as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { fetchClimberSheetLogs } = await import("./actions");
    expect(await fetchClimberSheetLogs(USER_A, SET_SAME)).toEqual({
      error: "Climber not in this gym",
    });
  });

  it("sanitises raw logs — flash derived from attempts===1, no raw attempt count in output", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue({
      supabase: createMockSupabase({
        "table:sets": { data: { owner_kind: "gym", gym_id: GYM_OWN } },
        "table:gym_memberships": { data: { user_id: USER_A } },
      }) as never,
      userId: USER_A,
      gymId: GYM_OWN,
    });
    const { getLogsBySetForUser } = await import("@/lib/data/route-log-queries");
    vi.mocked(getLogsBySetForUser).mockResolvedValue([
      {
        id: "log1",
        user_id: USER_A,
        route_id: "r1",
        set_id: SET_SAME,
        player_id: null,
        gym_id: GYM_OWN,
        attempts: 1,
        completed: true,
        zone: true,
        grade_vote: 4,
        completed_at: "2026-01-01",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
      {
        id: "log2",
        user_id: USER_A,
        route_id: "r2",
        set_id: SET_SAME,
        player_id: null,
        gym_id: GYM_OWN,
        attempts: 4,
        completed: false,
        zone: false,
        grade_vote: null,
        completed_at: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ]);

    const { fetchClimberSheetLogs } = await import("./actions");
    const result = await fetchClimberSheetLogs(USER_A, SET_SAME);
    if ("error" in result) throw new Error("expected success");
    expect(result.logs).toEqual([
      {
        route_id: "r1",
        completed: true,
        is_flash: true,
        has_attempts: true,
        zone: true,
        grade_vote: 4,
      },
      {
        route_id: "r2",
        completed: false,
        is_flash: false,
        has_attempts: true,
        zone: false,
        grade_vote: null,
      },
    ]);
    // Privacy contract: raw attempt count must not appear in output.
    for (const log of result.logs) {
      expect(log).not.toHaveProperty("attempts");
    }
  });
});
