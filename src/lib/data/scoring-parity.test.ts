import { describe, expect, it } from "vitest";

import { latestDefinition, normaliseClause } from "@/test/sql-definitions";
import { computePoints } from "./logs";
import { computeMatchLeaderboard } from "./match-leaderboard";
import type { MatchLog, MatchPlayerView } from "./match-types";

/**
 * Cross-home parity for scoring + rank semantics.
 *
 * The Scoring ladder deliberately lives in exactly two homes —
 * `computePoints()` (TS) and `public.compute_points` (SQL) — and the
 * match tiebreak in two more (`computeMatchLeaderboard` mirrors
 * `get_match_leaderboard`). CONTEXT.md promises "a scoring change is
 * one edit in each home", but until this file nothing failed when
 * only one home was edited: logs.test.ts pinned the TS ladder, the
 * SQL had no pin at all, and both suites stayed green through a
 * one-sided change.
 *
 * These tests read the LATEST migration definition of each function
 * (create-or-replace semantics: the last definition in filename
 * order wins) and hold the TS implementation to it. If a test here
 * fails after you edited one home, the fix is to edit the other
 * home — never to loosen the parser.
 *
 * Known divergence, deliberately NOT pinned: `end_match` writes summary
 * ranks with `row_number()` (arbitrary tie order) while the live
 * board uses `dense_rank()`. Tie handling in summaries is a product
 * decision parked with the matches overhaul (docs/roadmap.md).
 */

function denseRankClause(body: string, fn: string): string {
  const m = body.match(/dense_rank\(\)\s+over\s*\(\s*order by([\s\S]*?)\)/i);
  if (!m) throw new Error(`No dense_rank clause found in ${fn}`);
  return normaliseClause(m[1]);
}

// ── 1. Scoring ladder: TS ↔ SQL ─────────────────────────────────

describe("scoring ladder parity (computePoints ↔ public.compute_points)", () => {
  const { file, body } = latestDefinition("compute_points");

  // Evaluate the SQL ladder by parsing its numbers out. The shape is
  // deliberately rigid:
  //   when p_completed and p_attempts = N then P   (per-rung)
  //   when p_completed then P                      (the 4+ rung)
  //   else P                                       (incomplete)
  //   + case when p_zone then B else Z end         (zone bonus)
  // A scoring change edits numbers, not shape — if the shape itself
  // changes, update this parser AND computePoints together.
  function sqlLadder(attempts: number, completed: boolean, zone: boolean): number {
    const rungs = [...body.matchAll(
      /when p_completed and p_attempts = (\d+) then (\d+)/g,
    )].map((m) => [Number(m[1]), Number(m[2])] as const);
    const fallThrough = body.match(/when p_completed then (\d+)/);
    const incomplete = body.match(/else (\d+)/);
    const zoneBonus = body.match(/case when p_zone then (\d+) else (\d+) end/);
    if (rungs.length === 0 || !fallThrough || !incomplete || !zoneBonus) {
      throw new Error(
        `compute_points in ${file} no longer matches the expected ladder shape — update scoring-parity.test.ts alongside it`,
      );
    }
    let pts: number;
    if (!completed) {
      pts = Number(incomplete[1]);
    } else {
      const rung = rungs.find(([n]) => n === attempts);
      pts = rung ? rung[1] : Number(fallThrough[1]);
    }
    return pts + (zone ? Number(zoneBonus[1]) : Number(zoneBonus[2]));
  }

  it(`matches the SQL definition (${file}) over the full input domain`, () => {
    for (const attempts of [0, 1, 2, 3, 4, 5, 10, 99]) {
      for (const completed of [true, false]) {
        for (const zone of [true, false]) {
          expect(
            computePoints({ attempts, completed, zone }),
            `attempts=${attempts} completed=${completed} zone=${zone}`,
          ).toBe(sqlLadder(attempts, completed, zone));
        }
      }
    }
  });
});

// ── 2. Rank clause: every ranked surface orders the same way ────

const GYM_RANK_CLAUSE = "points desc, flashes desc, sends desc";
const MATCH_RANK_CLAUSE = `${GYM_RANK_CLAUSE}, last_send_at asc nulls last`;

describe("rank clause parity across leaderboard RPCs", () => {
  const gymFns = [
    "get_leaderboard_set",
    "get_leaderboard_all_time",
    "get_leaderboard_user_row",
    "get_leaderboard_neighbourhood",
    "get_leaderboard_set_cached",
    "get_leaderboard_all_time_cached",
  ];

  it.each(gymFns)("%s ranks by the shared gym clause", (fn) => {
    const { body } = latestDefinition(fn);
    expect(denseRankClause(body, fn)).toBe(GYM_RANK_CLAUSE);
  });

  // The Match board adds a last-send tiebreak the gym board doesn't
  // have: a Match ranks its whole roster, so ties are common enough
  // that "who got there first" is worth breaking on.
  it("get_match_leaderboard ranks by the gym clause + last-send tiebreak", () => {
    const { body } = latestDefinition("get_match_leaderboard");
    expect(denseRankClause(body, "get_match_leaderboard")).toBe(MATCH_RANK_CLAUSE);
  });

  // `match_standings` (085) ranks history and the shared result card.
  // It must agree with the live board exactly, or a finished Match
  // would reorder itself the moment you looked at it on another
  // screen — which is precisely the bug the old summary snapshot had.
  it("match_standings ranks identically to the live board", () => {
    const { body } = latestDefinition("match_standings");
    expect(denseRankClause(body, "match_standings")).toBe(MATCH_RANK_CLAUSE);
  });

  it("get_match_leaderboard scores through the shared SQL ladder", () => {
    const { body, file } = latestDefinition("get_match_leaderboard");
    expect(
      body.includes("public.compute_points("),
      `get_match_leaderboard (live definition in ${file}) no longer delegates ` +
        `to compute_points. The ladder has exactly two homes — computePoints ` +
        `in logs.ts and compute_points in SQL — see CLAUDE.md "Domain rules".`,
    ).toBe(true);
  });
});

// ── 3. TS match mirror implements the same clause + dense_rank ────

describe("computeMatchLeaderboard implements the SQL tiebreak", () => {
  const player = (uid: string): MatchPlayerView => ({
    user_id: uid,
    username: uid,
    display_name: uid,
    avatar_url: null,
    joined_at: "2026-08-14T07:00:00Z",
    is_host: false,
  });

  const log = (
    uid: string,
    routeId: string,
    partial: Partial<MatchLog>,
  ): [string, MatchLog] => [
    `${uid}:${routeId}`,
    {
      id: `${uid}:${routeId}`,
      set_id: "match-1",
      route_id: routeId,
      user_id: uid,
      attempts: 1,
      completed: true,
      completed_at: null,
      zone: false,
      created_at: "2026-08-14T07:00:00Z",
      updated_at: "2026-08-14T07:00:00Z",
      ...partial,
    },
  ];

  it("orders by every key of the SQL clause, nulls last", () => {
    // One row pair per clause key, all constructed so dropping or
    // reordering ANY key changes the output. Tuples are
    // (points, flashes, sends, last_send_at):
    //   p1 (8, 2, 2, null)   — points decides first
    //   p4 (4, 1, 1, 08:00)  ┐ flashes beats p3's 0 despite fewer
    //   p2 (4, 1, 1, 10:00)  ├ sends; within the triple tie,
    //   p5 (4, 1, 1, 11:00)  ┘ last_send_at asc decides
    //   p3 (4, 0, 2, 09:30)  — sends only reached after flashes
    //   p6 (1, 0, 0, null)   ┐ zone-only rows: full-tuple tie,
    //   p7 (1, 0, 0, null)   ┘ null last send sorts last
    const logs = new Map<string, MatchLog>([
      log("p1", "r1", { attempts: 1 }),
      log("p1", "r2", { attempts: 1 }),
      log("p2", "r1", { attempts: 1, completed_at: "2026-08-14T10:00:00Z" }),
      log("p3", "r1", { attempts: 2, completed_at: "2026-08-14T09:00:00Z" }),
      log("p3", "r2", { attempts: 4, completed_at: "2026-08-14T09:30:00Z" }),
      log("p4", "r2", { attempts: 1, completed_at: "2026-08-14T08:00:00Z" }),
      log("p5", "r2", { attempts: 1, completed_at: "2026-08-14T11:00:00Z" }),
      log("p6", "r1", { attempts: 3, completed: false, zone: true }),
      log("p7", "r2", { attempts: 2, completed: false, zone: true }),
    ]);

    const rows = computeMatchLeaderboard(
      ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map(player),
      logs,
    );

    expect(rows.map((r) => r.user_id)).toEqual([
      "p1",
      "p4",
      "p2",
      "p5",
      "p3",
      "p6",
      "p7",
    ]);
  });

  it("assigns dense ranks: a tie shares its rank and the NEXT distinct row takes rank+1", () => {
    // The regression this pins: `rank = index + 1` on key change is
    // SQL rank() (gaps after ties), not the dense_rank() the RPC
    // uses. With two tied at rank 2, the next player must be 3 —
    // rank() would call them 4.
    const logs = new Map<string, MatchLog>([
      log("top", "r1", { attempts: 1 }), // 4 pts, flash
      log("tieA", "r1", { attempts: 2, completed_at: "2026-08-14T09:00:00Z" }), // 3 pts
      log("tieB", "r2", { attempts: 2, completed_at: "2026-08-14T09:00:00Z" }), // 3 pts, same tuple
      log("last", "r1", { attempts: 4, completed_at: "2026-08-14T10:00:00Z" }), // 1 pt
    ]);

    const rows = computeMatchLeaderboard(
      ["top", "tieA", "tieB", "last"].map(player),
      logs,
    );

    const ranks = new Map(rows.map((r) => [r.user_id, r.rank]));
    expect(ranks.get("top")).toBe(1);
    expect(ranks.get("tieA")).toBe(2);
    expect(ranks.get("tieB")).toBe(2);
    expect(ranks.get("last")).toBe(3);
  });
});
