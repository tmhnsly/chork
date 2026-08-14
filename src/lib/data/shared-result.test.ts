import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase } from "@/test/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const SUMMARY_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TOKEN = "abcdefghijklmnopqrstuvwx1234";

beforeEach(() => {
  vi.resetAllMocks();
});

async function primeService(primed: Parameters<typeof createMockSupabase>[0]) {
  const { createServiceClient } = await import("@/lib/supabase/server");
  const sb = createMockSupabase(primed);
  vi.mocked(createServiceClient).mockReturnValue(sb as never);
  return sb;
}

describe("getSharedResult", () => {
  it("rejects a malformed token without touching the database", async () => {
    const sb = await primeService({});
    const { getSharedResult } = await import("./shared-result");
    expect(await getSharedResult("../etc/passwd")).toBeNull();
    expect(sb.calls).toEqual([]);
  });

  it("returns null for a token that resolves to nothing", async () => {
    await primeService({ "table:jam_summaries": { data: null } });
    const { getSharedResult } = await import("./shared-result");
    expect(await getSharedResult(TOKEN)).toBeNull();
  });

  it("looks the result up BY TOKEN, never by id", async () => {
    // The token is the whole capability — an id-keyed lookup here
    // would make every summary walkable.
    const sb = await primeService({
      "table:jam_summaries": {
        data: {
          id: SUMMARY_1,
          name: "Tuesday",
          location: "Yonder",
          ended_at: "2026-08-13T20:00:00Z",
          player_count: 3,
        },
      },
      "table:jam_summary_players": { data: [] },
    });
    const { getSharedResult } = await import("./shared-result");
    await getSharedResult(TOKEN);

    const eqArgs = sb.calls
      .filter((c) => c.source === "jam_summaries" && c.method === "eq")
      .map((c) => c.args);
    expect(eqArgs).toContainEqual(["share_token", TOKEN]);
  });

  it("maps players in rank order with the public fields", async () => {
    await primeService({
      "table:jam_summaries": {
        data: {
          id: SUMMARY_1,
          name: "Tuesday",
          location: "Yonder",
          ended_at: "2026-08-13T20:00:00Z",
          player_count: 2,
        },
      },
      "table:jam_summary_players": {
        data: [
          {
            rank: 1,
            display_name: "Alice",
            username: "alice",
            points: 24,
            sends: 6,
            flashes: 3,
            zones: 2,
            is_winner: true,
          },
        ],
      },
    });
    const { getSharedResult } = await import("./shared-result");
    const res = await getSharedResult(TOKEN);
    expect(res?.players[0]).toEqual({
      rank: 1,
      displayName: "Alice",
      username: "alice",
      points: 24,
      sends: 6,
      flashes: 3,
      zones: 2,
      isWinner: true,
    });
  });
});

// ── The privacy pin ───────────────────────────────────────────────
describe("public result never exposes attempts", () => {
  // Anyone holding the link can read whatever this returns, and raw
  // attempt counts are owner-only (CONTEXT.md "Attempt privacy").
  // `jam_summary_players.attempts` EXISTS on the row, so the guard is
  // that we never select it — which a `select("*")` or a helpful
  // "add attempts to the card" would quietly undo.
  const source = readFileSync(
    join(process.cwd(), "src/lib/data/shared-result.ts"),
    "utf8",
  );
  // Comments stripped: the file talks about `attempts` at length to
  // explain why it's absent, and that prose is the documentation —
  // it's the CODE that must not mention it.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("never selects the attempts column", () => {
    expect(code).not.toMatch(/attempts/);
  });

  it("never selects * from the player table", () => {
    expect(code).not.toMatch(/select\(\s*["'`]\*/);
  });

  it("omits attempts from the returned player shape", async () => {
    await primeService({
      "table:jam_summaries": {
        data: {
          id: SUMMARY_1,
          name: null,
          location: null,
          ended_at: "2026-08-13T20:00:00Z",
          player_count: 1,
        },
      },
      "table:jam_summary_players": {
        data: [
          {
            rank: 1,
            display_name: "Alice",
            username: "alice",
            points: 4,
            sends: 1,
            flashes: 1,
            zones: 0,
            is_winner: true,
            // Even if the row carries it, it must not survive mapping.
            attempts: 17,
          },
        ],
      },
    });
    const { getSharedResult } = await import("./shared-result");
    const res = await getSharedResult(TOKEN);
    expect(res?.players[0]).not.toHaveProperty("attempts");
    expect(JSON.stringify(res)).not.toContain("17");
  });
});

describe("mintShareToken", () => {
  it("returns the existing token rather than minting a second", async () => {
    // One canonical URL per result, however many people share it.
    const sb = await primeService({
      "table:jam_summaries": { data: { share_token: "already-minted-token" } },
    });
    const { mintShareToken } = await import("./shared-result");
    expect(await mintShareToken(SUMMARY_1)).toBe("already-minted-token");
    expect(
      sb.calls.some((c) => c.method === "update"),
      "should not write when a token already exists",
    ).toBe(false);
  });

  it("mints and stores an unguessable token when there is none", async () => {
    const sb = await primeService({
      "table:jam_summaries": { data: { share_token: null }, error: null },
    });
    const { mintShareToken } = await import("./shared-result");
    const token = await mintShareToken(SUMMARY_1);

    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const update = sb.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ share_token: token });
  });

  it("returns null when the write fails, so no link is handed out", async () => {
    await primeService({
      "table:jam_summaries": [
        { data: { share_token: null } },
        { data: null, error: { code: "23505", message: "dup" } },
      ],
    });
    const { mintShareToken } = await import("./shared-result");
    expect(await mintShareToken(SUMMARY_1)).toBeNull();
  });
});
