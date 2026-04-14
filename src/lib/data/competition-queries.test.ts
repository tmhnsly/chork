/**
 * Competition query helpers — small, mostly shape-passing functions.
 * Tests target the paths with real logic (`getCompetitionGyms`
 * join flatten, error → [] fallbacks) and the ones used in auth
 * decisions upstream.
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

function scriptedSupabase(results: SbResult[]) {
  let i = 0;
  return {
    from: (_table: string) =>
      makeChain(() => results[Math.min(i++, results.length - 1)] ?? { data: null }),
  };
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const COMP_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeEach(() => {
  vi.resetAllMocks();
});

// ────────────────────────────────────────────────────────────────
// getCompetitionById
// ────────────────────────────────────────────────────────────────
describe("getCompetitionById", () => {
  it("returns null on error — never throws upstream", async () => {
    const sb = scriptedSupabase([{ data: null, error: { message: "rls" } }]);
    const { getCompetitionById } = await import("./competition-queries");
    expect(await getCompetitionById(sb as never, COMP_1)).toBeNull();
  });

  it("returns the raw row on success", async () => {
    const row = {
      id: COMP_1,
      name: "Spring Cup",
      description: null,
      starts_at: "2026-03-01",
      ends_at: "2026-04-01",
      status: "live",
      organiser_id: USER_A,
    };
    const sb = scriptedSupabase([{ data: row }]);
    const { getCompetitionById } = await import("./competition-queries");
    expect(await getCompetitionById(sb as never, COMP_1)).toEqual(row);
  });
});

// ────────────────────────────────────────────────────────────────
// getCompetitionsForOrganiser — organiser scoping
// ────────────────────────────────────────────────────────────────
describe("getCompetitionsForOrganiser", () => {
  it("returns [] on error", async () => {
    const sb = scriptedSupabase([{ data: null, error: { message: "rls" } }]);
    const { getCompetitionsForOrganiser } = await import("./competition-queries");
    expect(await getCompetitionsForOrganiser(sb as never, USER_A)).toEqual([]);
  });

  it("passes data through untouched on success", async () => {
    const rows = [
      {
        id: COMP_1,
        name: "Spring Cup",
        description: null,
        starts_at: "2026-03-01",
        ends_at: "2026-04-01",
        status: "live",
        organiser_id: USER_A,
      },
    ];
    const sb = scriptedSupabase([{ data: rows }]);
    const { getCompetitionsForOrganiser } = await import("./competition-queries");
    expect(await getCompetitionsForOrganiser(sb as never, USER_A)).toEqual(rows);
  });
});

// ────────────────────────────────────────────────────────────────
// getCompetitionGyms — join flatten
// ────────────────────────────────────────────────────────────────
describe("getCompetitionGyms", () => {
  it("drops rows where the gym join didn't resolve", async () => {
    const sb = scriptedSupabase([
      {
        data: [
          { competition_id: COMP_1, gym_id: "g1", gyms: { name: "Yonder", slug: "yonder" } },
          { competition_id: COMP_1, gym_id: "g2", gyms: null },
        ],
      },
    ]);
    const { getCompetitionGyms } = await import("./competition-queries");
    expect(await getCompetitionGyms(sb as never, COMP_1)).toEqual([
      { competition_id: COMP_1, gym_id: "g1", gym_name: "Yonder", gym_slug: "yonder" },
    ]);
  });

  it("unwraps the `gyms` property if supabase returns it as a single-element array", async () => {
    const sb = scriptedSupabase([
      {
        data: [
          {
            competition_id: COMP_1,
            gym_id: "g1",
            gyms: [{ name: "Yonder", slug: "yonder" }],
          },
        ],
      },
    ]);
    const { getCompetitionGyms } = await import("./competition-queries");
    expect(await getCompetitionGyms(sb as never, COMP_1)).toEqual([
      { competition_id: COMP_1, gym_id: "g1", gym_name: "Yonder", gym_slug: "yonder" },
    ]);
  });
});

// ────────────────────────────────────────────────────────────────
// getMyCompetitionParticipation
// ────────────────────────────────────────────────────────────────
describe("getMyCompetitionParticipation", () => {
  it("returns null when the caller hasn't joined", async () => {
    const sb = scriptedSupabase([{ data: null }]);
    const { getMyCompetitionParticipation } = await import("./competition-queries");
    expect(
      await getMyCompetitionParticipation(sb as never, COMP_1, USER_A),
    ).toBeNull();
  });
});
