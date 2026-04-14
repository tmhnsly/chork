/**
 * Crew query helpers — shape + join-flatten + tally logic. These
 * are pure transforms on Supabase responses so we feed them
 * hand-crafted results and assert the mapping lines up with what
 * the UI expects.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type SbResult = { data?: unknown; error?: unknown };

function makeChain(resolve: () => SbResult) {
  const builder: Record<string, unknown> = {};
  const chain: (...args: unknown[]) => typeof builder = () => builder;
  const methods = [
    "select", "eq", "neq", "in", "or", "order", "limit", "range",
    "maybeSingle", "single",
  ];
  for (const m of methods) (builder[m] as unknown) = chain;
  builder.then = (onFulfilled: (v: SbResult) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return builder;
}

type Script = Array<{ table?: string; rpc?: string; result: SbResult }>;

function scriptedSupabase(script: Script) {
  let i = 0;
  const next = (): SbResult => {
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    return step?.result ?? { data: null };
  };
  return {
    from: (_table: string) => makeChain(next),
    rpc: (_name: string) => makeChain(next),
  };
}

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
    const sb = scriptedSupabase([{ result: { data: [] } }]);
    const { getMyCrews } = await import("./crew-queries");
    expect(await getMyCrews(sb as never, USER_A)).toEqual([]);
  });

  it("flattens crew join rows, tallies members per crew, sorts oldest → newest", async () => {
    const sb = scriptedSupabase([
      {
        result: {
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
      },
      // Member-count fetch — two members in CREW_1, one in CREW_2
      {
        result: {
          data: [
            { crew_id: CREW_1 },
            { crew_id: CREW_1 },
            { crew_id: CREW_2 },
          ],
        },
      },
    ]);
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
    const sb = scriptedSupabase([
      {
        result: {
          data: [
            {
              crew_id: CREW_1,
              crews: [{ id: CREW_1, name: "Alpha", created_by: USER_A, created_at: "2026-01-01" }],
            },
          ],
        },
      },
      { result: { data: [{ crew_id: CREW_1 }] } },
    ]);
    const { getMyCrews } = await import("./crew-queries");
    const result = await getMyCrews(sb as never, USER_A);
    expect(result[0]).toMatchObject({ id: CREW_1, name: "Alpha", member_count: 1 });
  });

  it("returns [] on DB error — never throws", async () => {
    const sb = scriptedSupabase([
      { result: { data: null, error: { message: "rls" } } },
    ]);
    const { getMyCrews } = await import("./crew-queries");
    expect(await getMyCrews(sb as never, USER_A)).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────
// getPendingCrewInvites — invite-shape mapping
// ────────────────────────────────────────────────────────────────
describe("getPendingCrewInvites", () => {
  it("returns [] on error", async () => {
    const sb = scriptedSupabase([{ result: { data: null, error: { message: "rls" } } }]);
    const { getPendingCrewInvites } = await import("./crew-queries");
    expect(await getPendingCrewInvites(sb as never, USER_A)).toEqual([]);
  });

  it("drops rows missing either crew or inviter (join failures)", async () => {
    const sb = scriptedSupabase([
      {
        result: {
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
      },
    ]);
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
    const sb = scriptedSupabase([{ result: { data: [] } }]);
    const { getCrewCountForUser } = await import("./crew-queries");
    expect(await getCrewCountForUser(sb as never, USER_A)).toBe(0);
  });
});
