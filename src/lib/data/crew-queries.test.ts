/**
 * Crew query helpers — shape + join-flatten + tally logic. These
 * are pure transforms on Supabase responses so we feed them
 * hand-crafted results and assert the mapping lines up with what
 * the UI expects.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockSupabase } from "@/test/mock-supabase";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const CREW_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────
// getMyCrews — join flatten + member-count tally + sort
// ────────────────────────────────────────────────────────────────
describe("getMyCrews", () => {
  it("returns [] when the caller has no active membership", async () => {
    const sb = createMockSupabase({ "table:crew_members": { data: [] } });
    const { getMyCrews } = await import("./crew-queries");
    expect(await getMyCrews(sb as never, USER_A)).toEqual([]);
  });

  it("flattens crew join rows, tallies members per crew, sorts oldest → newest", async () => {
    const sb = createMockSupabase({
      "table:crew_members": {
        data: [
          {
            crew_id: CREW_2,
            crews: { id: CREW_2, name: "Beta", created_by: USER_A, created_at: "2026-02-01" },
          },
          {
            crew_id: CREW_1,
            crews: { id: CREW_1, name: "Alpha", created_by: USER_A, created_at: "2026-01-01" },
          },
        ],
      },
      // get_crew_member_counts RPC — one row per crew with count
      "rpc:get_crew_member_counts": {
        data: [
          { crew_id: CREW_1, count: 2 },
          { crew_id: CREW_2, count: 1 },
        ],
      },
    });
    const { getMyCrews } = await import("./crew-queries");
    const result = await getMyCrews(sb as never, USER_A);
    expect(result).toEqual([
      { id: CREW_1, name: "Alpha", created_by: USER_A, created_at: "2026-01-01", member_count: 2 },
      { id: CREW_2, name: "Beta",  created_by: USER_A, created_at: "2026-02-01", member_count: 1 },
    ]);
  });

  it("treats `crews` as an array and takes the first when supabase returns one", async () => {
    // Supabase's typing sometimes unwraps a one-row join as an array.
    // The mapper handles both shapes.
    const sb = createMockSupabase({
      "table:crew_members": {
        data: [
          {
            crew_id: CREW_1,
            crews: [{ id: CREW_1, name: "Alpha", created_by: USER_A, created_at: "2026-01-01" }],
          },
        ],
      },
      "rpc:get_crew_member_counts": { data: [{ crew_id: CREW_1, count: 1 }] },
    });
    const { getMyCrews } = await import("./crew-queries");
    const result = await getMyCrews(sb as never, USER_A);
    expect(result[0]).toMatchObject({ id: CREW_1, name: "Alpha", member_count: 1 });
  });

  it("returns [] on DB error — never throws", async () => {
    const sb = createMockSupabase({
      "table:crew_members": { data: null, error: { message: "rls" } },
    });
    const { getMyCrews } = await import("./crew-queries");
    expect(await getMyCrews(sb as never, USER_A)).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────
// getPendingCrewInvites — invite-shape mapping
// ────────────────────────────────────────────────────────────────
describe("getPendingCrewInvites", () => {
  it("returns [] on error", async () => {
    const sb = createMockSupabase({
      "table:crew_members": { data: null, error: { message: "rls" } },
    });
    const { getPendingCrewInvites } = await import("./crew-queries");
    expect(await getPendingCrewInvites(sb as never, USER_A)).toEqual([]);
  });

  it("drops rows missing either crew or inviter (join failures)", async () => {
    const sb = createMockSupabase({
      "table:crew_members": {
        data: [
          {
            id: "inv1",
            crew_id: CREW_1,
            invited_by: USER_B,
            created_at: "2026-01-01",
            crews: null,
            inviter: { username: "b" },
          },
          {
            id: "inv2",
            crew_id: CREW_1,
            invited_by: USER_B,
            created_at: "2026-01-01",
            crews: { name: "Alpha" },
            inviter: null,
          },
        ],
      },
    });
    const { getPendingCrewInvites } = await import("./crew-queries");
    const result = await getPendingCrewInvites(sb as never, USER_A);
    expect(result).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────
// getCrewCountForUser — simple count passthrough
// ────────────────────────────────────────────────────────────────
describe("getCrewCountForUser", () => {
  it("returns 0 when no rows", async () => {
    const sb = createMockSupabase({ "table:crew_members": { data: [] } });
    const { getCrewCountForUser } = await import("./crew-queries");
    expect(await getCrewCountForUser(sb as never, USER_A)).toBe(0);
  });
});
