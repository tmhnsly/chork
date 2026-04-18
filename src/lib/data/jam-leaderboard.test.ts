import { describe, expect, it } from "vitest";
import { computeJamLeaderboard } from "./jam-leaderboard";
import type { JamLog, JamPlayerView } from "./jam-types";

function mkPlayer(user_id: string, username: string): JamPlayerView {
  return {
    user_id,
    username,
    display_name: username,
    avatar_url: null,
    joined_at: "2026-04-01T00:00:00Z",
    is_host: false,
  };
}

function mkLog(
  user_id: string,
  jam_route_id: string,
  attempts: number,
  completed: boolean,
  zone = false,
  completed_at: string | null = null,
): JamLog {
  return {
    id: `${user_id}-${jam_route_id}`,
    jam_id: "jam-1",
    jam_route_id,
    user_id,
    attempts,
    completed,
    completed_at,
    zone,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  };
}

function logsMap(logs: JamLog[]): Map<string, JamLog> {
  const m = new Map<string, JamLog>();
  for (const l of logs) m.set(`${l.user_id}:${l.jam_route_id}`, l);
  return m;
}

describe("computeJamLeaderboard", () => {
  it("awards 4 points for a flash + 1 for a zone", () => {
    const rows = computeJamLeaderboard(
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
    const rows = computeJamLeaderboard(
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
    const rows = computeJamLeaderboard(
      [mkPlayer("u1", "a")],
      logsMap([mkLog("u1", "r1", 3, false, false, null)]),
    );
    expect(rows[0].points).toBe(0);
    expect(rows[0].sends).toBe(0);
    expect(rows[0].attempts).toBe(3);
  });

  it("awards a zone bonus even when the climb is incomplete", () => {
    const rows = computeJamLeaderboard(
      [mkPlayer("u1", "a")],
      logsMap([mkLog("u1", "r1", 2, false, true, null)]),
    );
    expect(rows[0].points).toBe(1);
    expect(rows[0].zones).toBe(1);
    expect(rows[0].sends).toBe(0);
  });

  it("tiebreaks by flashes → sends → last_send_at (earliest wins)", () => {
    const rows = computeJamLeaderboard(
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
    const rows = computeJamLeaderboard(
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
    const rows = computeJamLeaderboard(
      [mkPlayer("u1", "a"), mkPlayer("u2", "b")],
      logsMap([mkLog("u1", "r1", 1, true, false, "2026-04-01T10:00:00Z")]),
    );
    const silent = rows.find((r) => r.user_id === "u2");
    expect(silent?.points).toBe(0);
    expect(silent?.sends).toBe(0);
  });

  it("handles empty player set without throwing", () => {
    const rows = computeJamLeaderboard([], new Map());
    expect(rows).toEqual([]);
  });

  it("orders last_send_at nulls last (server matches nulls last)", () => {
    const rows = computeJamLeaderboard(
      [mkPlayer("silent", "a"), mkPlayer("flashed", "b")],
      logsMap([
        mkLog("silent", "r1", 1, true, false, null),
        mkLog("flashed", "r1", 1, true, false, "2026-04-01T10:00:00Z"),
      ]),
    );
    expect(rows[0].user_id).toBe("flashed");
  });
});
