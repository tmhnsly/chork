import { describe, expect, it } from "vitest";
import { computeMatchLeaderboard } from "./match-leaderboard";
import { computePoints } from "./logs";
import type { MatchLog, MatchPlayerView } from "./match-types";

function mkPlayer(user_id: string, username: string): MatchPlayerView {
  return {
    // Seat id mirrors the account id in fixtures, so assertions keyed
    // on one keep meaning the same thing as the other.
    player_id: user_id,
    user_id,
    is_guest: false,
    ceiling: null,
    alt_ceiling: null,
    username,
    display_name: username,
    avatar_url: null,
    joined_at: "2026-04-01T00:00:00Z",
    is_host: false,
    has_left: false,
  };
}

function mkLog(
  user_id: string,
  route_id: string,
  attempts: number,
  completed: boolean,
  zone = false,
  completed_at: string | null = null,
): MatchLog {
  return {
    id: `${user_id}-${route_id}`,
    set_id: "match-1",
    route_id,
    user_id,
    player_id: null,
    attempts,
    completed,
    completed_at,
    zone,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  };
}

function logsMap(logs: MatchLog[]): Map<string, MatchLog> {
  const m = new Map<string, MatchLog>();
  for (const l of logs) m.set(`${l.user_id}:${l.route_id}`, l);
  return m;
}

describe("computeMatchLeaderboard", () => {
  it("awards 4 points for a flash + 1 for a zone", () => {
    const rows = computeMatchLeaderboard(
      [mkPlayer("u1", "a")],
      logsMap([mkLog("u1", "r1", 1, true, true, "2026-04-01T10:00:00Z")]),
    );
    expect(rows[0].points).toBe(5);
    expect(rows[0].flashes).toBe(1);
    expect(rows[0].sends).toBe(1);
    expect(rows[0].zones).toBe(1);
    expect(rows[0].rank).toBe(1);
  });

  it("scales points: 1-try=4, 2-try=3, 3-try=2, 4+-try=1", () => {
    const rows = computeMatchLeaderboard(
      [
        mkPlayer("u1", "one"),
        mkPlayer("u2", "two"),
        mkPlayer("u3", "three"),
        mkPlayer("u4", "four"),
      ],
      logsMap([
        mkLog("u1", "r1", 1, true, false, "2026-04-01T10:00:00Z"),
        mkLog("u2", "r1", 2, true, false, "2026-04-01T10:00:01Z"),
        mkLog("u3", "r1", 3, true, false, "2026-04-01T10:00:02Z"),
        mkLog("u4", "r1", 5, true, false, "2026-04-01T10:00:03Z"),
      ]),
    );
    const byUser = new Map(rows.map((r) => [r.user_id, r.points]));
    expect(byUser.get("u1")).toBe(4);
    expect(byUser.get("u2")).toBe(3);
    expect(byUser.get("u3")).toBe(2);
    expect(byUser.get("u4")).toBe(1);
  });

  it("awards 0 points for an incomplete attempt without zone", () => {
    const rows = computeMatchLeaderboard(
      [mkPlayer("u1", "a")],
      logsMap([mkLog("u1", "r1", 3, false, false, null)]),
    );
    expect(rows[0].points).toBe(0);
    expect(rows[0].sends).toBe(0);
    expect(rows[0].attempts).toBe(3);
  });

  it("awards a zone bonus even when the climb is incomplete", () => {
    const rows = computeMatchLeaderboard(
      [mkPlayer("u1", "a")],
      logsMap([mkLog("u1", "r1", 2, false, true, null)]),
    );
    expect(rows[0].points).toBe(1);
    expect(rows[0].zones).toBe(1);
    expect(rows[0].sends).toBe(0);
  });

  it("tiebreaks by flashes → sends → last_send_at (earliest wins)", () => {
    const rows = computeMatchLeaderboard(
      [mkPlayer("early", "a"), mkPlayer("late", "b")],
      logsMap([
        mkLog("early", "r1", 1, true, false, "2026-04-01T10:00:00Z"),
        mkLog("late", "r1", 1, true, false, "2026-04-01T11:00:00Z"),
      ]),
    );
    expect(rows[0].user_id).toBe("early");
    expect(rows[1].user_id).toBe("late");
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
  });

  it("groups identical tuples under the same rank (dense_rank)", () => {
    const rows = computeMatchLeaderboard(
      [mkPlayer("u1", "a"), mkPlayer("u2", "b"), mkPlayer("u3", "c")],
      logsMap([
        mkLog("u1", "r1", 1, true, false, "2026-04-01T10:00:00Z"),
        mkLog("u2", "r1", 1, true, false, "2026-04-01T10:00:00Z"),
        mkLog("u3", "r1", 2, true, false, "2026-04-01T10:00:00Z"),
      ]),
    );
    const ranks = new Map(rows.map((r) => [r.user_id, r.rank]));
    expect(ranks.get("u1")).toBe(ranks.get("u2"));
    expect(ranks.get("u3")).toBeGreaterThan(ranks.get("u1")!);
  });

  it("returns zero-point rows for players with no logs", () => {
    const rows = computeMatchLeaderboard(
      [mkPlayer("u1", "a"), mkPlayer("u2", "b")],
      logsMap([mkLog("u1", "r1", 1, true, false, "2026-04-01T10:00:00Z")]),
    );
    const silent = rows.find((r) => r.user_id === "u2");
    expect(silent?.points).toBe(0);
    expect(silent?.sends).toBe(0);
  });

  it("handles empty player set without throwing", () => {
    const rows = computeMatchLeaderboard([], new Map());
    expect(rows).toEqual([]);
  });

  it("orders last_send_at nulls last (server matches nulls last)", () => {
    const rows = computeMatchLeaderboard(
      [mkPlayer("silent", "a"), mkPlayer("flashed", "b")],
      logsMap([
        mkLog("silent", "r1", 1, true, false, null),
        mkLog("flashed", "r1", 1, true, false, "2026-04-01T10:00:00Z"),
      ]),
    );
    expect(rows[0].user_id).toBe("flashed");
  });
});

describe("computeMatchLeaderboard × computePoints — scoring cross-check", () => {
  // Shared fixtures spanning every rung of the ladder, run through
  // BOTH scoring paths. Pins the "must match the get_match_leaderboard
  // RPC" invariant: flash=4, 2-try=3, 3-try=2, 4+=1, incomplete=0,
  // +1 zone (independent of completion — zone-on-incomplete=1).
  const fixtures: Array<{ log: MatchLog; expected: number }> = [
    { log: mkLog("u1", "flash", 1, true), expected: 4 },
    { log: mkLog("u1", "two-try", 2, true), expected: 3 },
    { log: mkLog("u1", "three-try", 3, true), expected: 2 },
    { log: mkLog("u1", "four-try", 4, true), expected: 1 },
    { log: mkLog("u1", "many-try", 17, true), expected: 1 },
    { log: mkLog("u1", "project", 5, false), expected: 0 },
    { log: mkLog("u1", "flash-zone", 1, true, true), expected: 5 },
    { log: mkLog("u1", "send-zone", 3, true, true), expected: 3 },
    { log: mkLog("u1", "zone-only", 2, false, true), expected: 1 },
  ];

  it("computePoints pins each rung of the ladder", () => {
    for (const { log, expected } of fixtures) {
      expect(computePoints(log), `route ${log.route_id}`).toBe(expected);
    }
  });

  it("computeMatchLeaderboard's per-log accumulation agrees with computePoints", () => {
    const rows = computeMatchLeaderboard(
      [mkPlayer("u1", "a")],
      logsMap(fixtures.map((f) => f.log)),
    );
    const viaComputePoints = fixtures.reduce(
      (sum, f) => sum + computePoints(f.log),
      0,
    );
    expect(rows[0].points).toBe(viaComputePoints);
    expect(rows[0].points).toBe(
      fixtures.reduce((sum, f) => sum + f.expected, 0),
    );
  });
});
