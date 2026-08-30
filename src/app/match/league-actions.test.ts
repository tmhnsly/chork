import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

// Auth runs for real over doubled primitives, as match/actions.test.ts
// does — the uuid gate and the rate limit are under test here.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
  createServerSupabase: vi.fn(),
  getServerUser: vi.fn(),
  getServerProfile: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ enforce: vi.fn() }));

const USER_A = "11111111-1111-1111-1111-111111111111";
const LEAGUE_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SET_1 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const AUTH_REQUIRED = "You need to be signed in to do that";

beforeEach(async () => {
  vi.resetAllMocks();
  const { enforce } = await import("@/lib/rate-limit");
  vi.mocked(enforce).mockResolvedValue({ ok: true });
});

async function mockSignedIn(primed: Parameters<typeof createMockSupabase>[0] = {}) {
  const sb = createMockSupabase(primed);
  const { createServerSupabase, getServerUser } = await import("@/lib/supabase/server");
  vi.mocked(createServerSupabase).mockResolvedValue(sb as never);
  vi.mocked(getServerUser).mockResolvedValue({ id: USER_A } as never);
  return sb;
}

async function mockAuthFailure() {
  const { createServerSupabase, getServerUser } = await import("@/lib/supabase/server");
  vi.mocked(createServerSupabase).mockResolvedValue(createMockSupabase() as never);
  vi.mocked(getServerUser).mockResolvedValue(null);
}

describe("createLeagueAction", () => {
  it("rejects a malformed match id before auth", async () => {
    const { createLeagueAction } = await import("./league-actions");
    expect(await createLeagueAction("Tuesday", "nope")).toEqual({ error: "Invalid match" });
  });

  it("needs a name", async () => {
    await mockSignedIn();
    const { createLeagueAction } = await import("./league-actions");
    expect(await createLeagueAction("   ", SET_1)).toEqual({ error: "Give the league a name" });
    expect(await createLeagueAction("x".repeat(81), SET_1)).toEqual({
      error: "League names are 80 characters or fewer",
    });
  });

  it("surfaces auth failure", async () => {
    await mockAuthFailure();
    const { createLeagueAction } = await import("./league-actions");
    expect(await createLeagueAction("Tuesday", SET_1)).toEqual({ error: AUTH_REQUIRED });
  });

  it("is rate limited on the mutationsWrite bucket", async () => {
    await mockSignedIn();
    const { enforce } = await import("@/lib/rate-limit");
    vi.mocked(enforce).mockResolvedValue({ ok: false, error: "Slow down", retryAfter: 60 });
    const { createLeagueAction } = await import("./league-actions");
    expect(await createLeagueAction("Tuesday", SET_1)).toEqual({ error: "Slow down" });
    expect(vi.mocked(enforce).mock.calls[0]?.[0]).toBe("mutationsWrite");
  });

  it("creates through the RPC and returns the id", async () => {
    const sb = await mockSignedIn({ "rpc:create_league": { data: LEAGUE_1 } });
    const { createLeagueAction } = await import("./league-actions");
    expect(await createLeagueAction("  Tuesday  ", SET_1)).toEqual({
      success: true,
      leagueId: LEAGUE_1,
    });
    expect(sb.calls.find((c) => c.source === "create_league")?.args[0]).toEqual({
      p_name: "Tuesday",
      p_set_id: SET_1,
    });
  });

  it("passes the RPC's own copy through on refusal", async () => {
    await mockSignedIn({
      "rpc:create_league": {
        error: { code: "P0001", message: "End the match first — only finished matches count as a week." },
      },
    });
    const { createLeagueAction } = await import("./league-actions");
    expect(await createLeagueAction("Tuesday", SET_1)).toEqual({
      error: "End the match first — only finished matches count as a week.",
    });
  });
});

describe("renameLeagueAction", () => {
  it("rejects a malformed league id", async () => {
    const { renameLeagueAction } = await import("./league-actions");
    expect(await renameLeagueAction("nope", "Tuesday")).toEqual({ error: "Invalid league" });
  });

  it("needs a name", async () => {
    await mockSignedIn();
    const { renameLeagueAction } = await import("./league-actions");
    expect(await renameLeagueAction(LEAGUE_1, "")).toEqual({ error: "Give the league a name" });
  });

  it("renames through the RPC", async () => {
    const sb = await mockSignedIn({ "rpc:rename_league": { data: LEAGUE_1 } });
    const { renameLeagueAction } = await import("./league-actions");
    expect(await renameLeagueAction(LEAGUE_1, "Wednesday")).toEqual({ success: true });
    expect(sb.calls.find((c) => c.source === "rename_league")?.args[0]).toEqual({
      p_league_id: LEAGUE_1,
      p_name: "Wednesday",
    });
  });
});

describe("addMatchToLeagueAction / removeMatchFromLeagueAction", () => {
  it("rejects malformed ids in order: league, then match", async () => {
    await mockSignedIn();
    const { addMatchToLeagueAction, removeMatchFromLeagueAction } = await import("./league-actions");
    expect(await addMatchToLeagueAction("nope", SET_1)).toEqual({ error: "Invalid league" });
    expect(await addMatchToLeagueAction(LEAGUE_1, "nope")).toEqual({ error: "Invalid match" });
    expect(await removeMatchFromLeagueAction("nope", SET_1)).toEqual({ error: "Invalid league" });
    expect(await removeMatchFromLeagueAction(LEAGUE_1, "nope")).toEqual({ error: "Invalid match" });
  });

  it("adds and removes through their RPCs", async () => {
    const sb = await mockSignedIn({
      "rpc:add_match_to_league": { data: LEAGUE_1 },
      "rpc:remove_match_from_league": { data: LEAGUE_1 },
    });
    const { addMatchToLeagueAction, removeMatchFromLeagueAction } = await import("./league-actions");
    expect(await addMatchToLeagueAction(LEAGUE_1, SET_1)).toEqual({ success: true });
    expect(await removeMatchFromLeagueAction(LEAGUE_1, SET_1)).toEqual({ success: true });
    expect(sb.calls.find((c) => c.source === "add_match_to_league")?.args[0]).toEqual({
      p_league_id: LEAGUE_1,
      p_set_id: SET_1,
    });
    expect(sb.calls.find((c) => c.source === "remove_match_from_league")?.args[0]).toEqual({
      p_league_id: LEAGUE_1,
      p_set_id: SET_1,
    });
  });

  it("surfaces 'Only the host can do that.'", async () => {
    await mockSignedIn({
      "rpc:add_match_to_league": { error: { code: "P0001", message: "Only the host can do that." } },
    });
    const { addMatchToLeagueAction } = await import("./league-actions");
    expect(await addMatchToLeagueAction(LEAGUE_1, SET_1)).toEqual({ error: "Only the host can do that." });
  });
});

describe("endLeagueAction", () => {
  it("rejects a malformed league id and surfaces auth failure", async () => {
    const { endLeagueAction } = await import("./league-actions");
    expect(await endLeagueAction("nope")).toEqual({ error: "Invalid league" });
    await mockAuthFailure();
    expect(await endLeagueAction(LEAGUE_1)).toEqual({ error: AUTH_REQUIRED });
  });

  it("ends through the RPC", async () => {
    const sb = await mockSignedIn({ "rpc:end_league": { data: LEAGUE_1 } });
    const { endLeagueAction } = await import("./league-actions");
    expect(await endLeagueAction(LEAGUE_1)).toEqual({ success: true });
    expect(sb.calls.find((c) => c.source === "end_league")?.args[0]).toEqual({ p_league_id: LEAGUE_1 });
  });
});
