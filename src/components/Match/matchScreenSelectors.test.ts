import { describe, expect, it } from "vitest";
import type { ChorkStanding, MatchLeaderboardRow } from "@/lib/data/match-types";
import { mkBundle, mkGuest, mkGuestLog, mkLog, mkMatch, mkPlayer, mkRoute } from "@/test/match-fixtures";
import { initMatchState, logKey, matchReducer, type MatchLocalState } from "./matchScreenReducer";
import {
  canSetRoute,
  openLog,
  penHolder,
  routeBeingEdited,
  seatInPanel,
  selectBoard,
  viewerLogs,
  viewerSeat,
} from "./matchScreenSelectors";

const me = { userId: "u1", isHost: false };
const host = { userId: "u1", isHost: true };

function stateOf(overrides: Parameters<typeof mkBundle>[0] = {}): MatchLocalState {
  return initMatchState(mkBundle(overrides));
}

function withPen(state: MatchLocalState, seatId: string): MatchLocalState {
  return matchReducer(state, {
    type: "set-chork",
    standings: [{ player_id: seatId, letters: 0, has_pen: true } as ChorkStanding],
  });
}

function serverRow(player_id: string, points: number): MatchLeaderboardRow {
  return {
    player_id,
    user_id: player_id,
    is_guest: false,
    username: player_id,
    display_name: player_id,
    avatar_url: null,
    sends: 1,
    flashes: 0,
    zones: 0,
    has_left: false,
    points,
    points_tenths: points * 10,
    attempts: 0,
    last_send_at: "2026-04-01T10:00:00Z",
    rank: 1,
  };
}

describe("viewerSeat / viewerLogs", () => {
  it("finds the viewer's own seat and logs, and nobody else's", () => {
    const state = stateOf({
      players: [mkPlayer("u1", "alice"), mkPlayer("u2", "bob")],
      my_logs: [mkLog("u1", "a"), mkLog("u1", "b")],
      other_logs: [mkLog("u2", "a")],
    });
    expect(viewerSeat(state, me)?.username).toBe("alice");
    expect([...viewerLogs(state, me).keys()]).toEqual(["a", "b"]);
  });

  it("has no seat for someone who holds none", () => {
    expect(viewerSeat(stateOf({ players: [mkPlayer("u2", "bob")] }), me)).toBeNull();
  });
});

describe("selectBoard", () => {
  it("scores the viewer here and takes everyone else from the server's board", () => {
    // Bob's log reaches this device collapsed (a 4-try send reads as a
    // second go, worth 3). The server scored the real one at 1.
    const state = stateOf({
      players: [mkPlayer("u1", "alice"), mkPlayer("u2", "bob")],
      routes: [mkRoute("a", 1)],
      my_logs: [mkLog("u1", "a", { attempts: 2 })],
      other_logs: [mkLog("u2", "a", { attempts: 2 })],
      leaderboard: [serverRow("u1", 0), serverRow("u2", 1)],
    });
    const board = selectBoard(state, me);
    expect(board.map((r) => [r.username, r.points])).toEqual([
      ["alice", 3],
      ["bob", 1],
    ]);
  });

  it("scores a host's guests here too, from the raw counts the host typed in", () => {
    const state = stateOf({
      match: mkMatch({ host_id: "u1" }),
      players: [mkPlayer("u1", "alice"), mkGuest("seat-9", "Dave")],
      routes: [mkRoute("a", 1)],
      guest_logs: [mkGuestLog("seat-9", "a", { attempts: 3 })],
      leaderboard: [],
    });
    expect(selectBoard(state, host).find((r) => r.player_id === "seat-9")?.points).toBe(2);
  });

  it("measures a send against the limit for the route's own discipline", () => {
    // A mixed day: bouldering limit 2, rope limit 8. The rope route is
    // grade 6, below the rope limit, so it scores flat; measured against
    // the bouldering limit it would have been a big handicap bonus.
    const flat = stateOf({
      match: mkMatch({ handicap: true, discipline: "boulder", alt_grading_scale: "french" }),
      players: [mkPlayer("u1", "alice", { ceiling: 2, alt_ceiling: 8 })],
      routes: [mkRoute("a", 1, { declared_grade: 6, discipline: "sport" })],
      my_logs: [mkLog("u1", "a", { attempts: 1 })],
    });
    const boosted = stateOf({
      match: mkMatch({ handicap: true, discipline: "boulder", alt_grading_scale: "french" }),
      players: [mkPlayer("u1", "alice", { ceiling: 2, alt_ceiling: 8 })],
      routes: [mkRoute("a", 1, { declared_grade: 6, discipline: "boulder" })],
      my_logs: [mkLog("u1", "a", { attempts: 1 })],
    });
    expect(selectBoard(boosted, me)[0].points_tenths).toBeGreaterThan(
      selectBoard(flat, me)[0].points_tenths,
    );
  });

  it("grades a route by what was declared, else what climbers voted", () => {
    const state = (declared: number | null, voted: number | null) =>
      stateOf({
        match: mkMatch({ handicap: true }),
        players: [mkPlayer("u1", "alice", { ceiling: 2 })],
        routes: [mkRoute("a", 1, { declared_grade: declared, community_grade: voted })],
        my_logs: [mkLog("u1", "a", { attempts: 1 })],
      });
    const tenths = (s: MatchLocalState) => selectBoard(s, me)[0].points_tenths;
    expect(tenths(state(null, 6))).toBe(tenths(state(6, null)));
    expect(tenths(state(6, 1))).toBe(tenths(state(6, null)));
  });

  it("scores every seat from logs in Chork, which has no server board", () => {
    const state = stateOf({
      match: mkMatch({ game_mode: "chork" }),
      players: [mkPlayer("u1", "alice"), mkPlayer("u2", "bob")],
      other_logs: [mkLog("u2", "a", { attempts: 1 })],
      leaderboard: [serverRow("u2", 99)],
    });
    expect(selectBoard(state, me).find((r) => r.player_id === "u2")?.points).toBe(4);
  });
});

describe("penHolder / canSetRoute", () => {
  const players = [mkPlayer("u1", "alice"), mkPlayer("u2", "bob"), mkGuest("seat-9", "Dave")];
  const chork = () => stateOf({ match: mkMatch({ game_mode: "chork" }), players });

  it("lets anyone add a route in a points game", () => {
    expect(canSetRoute(stateOf({ players }), me)).toBe(true);
    expect(penHolder(stateOf({ players }))).toBeNull();
  });

  it("lets only the pen holder set in Chork", () => {
    expect(canSetRoute(withPen(chork(), "u1"), me)).toBe(true);
    expect(canSetRoute(withPen(chork(), "u2"), me)).toBe(false);
    expect(penHolder(withPen(chork(), "u2"))?.username).toBe("bob");
  });

  it("lets the host set when the pen sits with a guest, who has no session to tap with", () => {
    expect(canSetRoute(withPen(chork(), "seat-9"), host)).toBe(true);
    expect(canSetRoute(withPen(chork(), "seat-9"), me)).toBe(false);
  });

  it("stays open while the pen is unknown, rather than locking a game on one bad response", () => {
    expect(canSetRoute(chork(), me)).toBe(true);
  });
});

describe("openLog", () => {
  const base = () =>
    stateOf({
      match: mkMatch({ host_id: "u1", discipline: "boulder", alt_grading_scale: "french" }),
      players: [mkPlayer("u1", "alice", { ceiling: 4, alt_ceiling: 7 }), mkGuest("seat-9", "Dave")],
      routes: [mkRoute("a", 1), mkRoute("b", 2, { discipline: "sport" })],
      my_logs: [mkLog("u1", "a", { attempts: 2 })],
      guest_logs: [mkGuestLog("seat-9", "a", { attempts: 5, completed: false, completed_at: null })],
    });
  const open = (state: MatchLocalState, routeId: string, playerId?: string) =>
    matchReducer(state, { type: "open-panel", panel: { kind: "log", routeId, playerId } });

  it("is null while no log sheet is open", () => {
    expect(openLog(base(), host)).toBeNull();
  });

  it("is the viewer's own seat and log by default", () => {
    const ctx = openLog(open(base(), "a"), host);
    expect(ctx?.seat?.username).toBe("alice");
    expect(ctx?.log?.attempts).toBe(2);
    expect(ctx?.guestSeatId).toBeNull();
  });

  it("is the guest's seat and the guest's log when the host enters for them", () => {
    // Passing the viewer's own log here showed "Route 1 — Dave" with the
    // host's goes and send on it.
    const ctx = openLog(open(base(), "a", "seat-9"), host);
    expect(ctx?.seat?.display_name).toBe("Dave");
    expect(ctx?.log?.attempts).toBe(5);
    expect(ctx?.guestSeatId).toBe("seat-9");
  });

  it("measures the route against the limit for its own discipline", () => {
    expect(openLog(open(base(), "a"), host)?.ceiling).toBe(4);
    expect(openLog(open(base(), "b"), host)?.ceiling).toBe(7);
  });

  it("closes itself when its route goes", () => {
    const gone = matchReducer(open(base(), "a"), { type: "remove-route", id: "a" });
    expect(openLog(gone, host)).toBeNull();
  });

  it("shows an allowance only for the round and seat it was fetched for", () => {
    const fetched = matchReducer(open(base(), "a"), {
      type: "set-allowance",
      routeId: "a",
      value: 3,
    });
    expect(openLog(fetched, host)?.allowance).toBe(3);
    // Another route, or the same route for a guest, must not borrow it.
    expect(openLog(open(fetched, "b"), host)?.allowance).toBeNull();
    expect(openLog(open(fetched, "a", "seat-9"), host)?.allowance).toBeNull();
  });
});

describe("routeBeingEdited / seatInPanel", () => {
  const state = stateOf({
    players: [mkPlayer("u1", "alice"), mkGuest("seat-9", "Dave")],
    routes: [mkRoute("a", 1)],
  });

  it("resolves the edit sheet's route from the model", () => {
    const editing = matchReducer(state, { type: "open-panel", panel: { kind: "edit", routeId: "a" } });
    expect(routeBeingEdited(editing)?.id).toBe("a");
    expect(routeBeingEdited(state)).toBeNull();
  });

  it("finds a peeked guest by their seat, which is the only id they have", () => {
    const peeking = matchReducer(state, {
      type: "open-panel",
      panel: { kind: "peek", playerId: "seat-9" },
    });
    expect(seatInPanel(peeking, "peek")?.display_name).toBe("Dave");
    expect(seatInPanel(peeking, "ceiling")).toBeNull();
  });

  it("finds the seat a limit is being set for", () => {
    const setting = matchReducer(state, {
      type: "open-panel",
      panel: { kind: "ceiling", playerId: "u1" },
    });
    expect(seatInPanel(setting, "ceiling")?.username).toBe("alice");
  });
});

// The reducer's own guarantee, read through the selector the screen uses.
describe("a host's guest log", () => {
  it("keeps its raw count from a tap through to the score", () => {
    const state = stateOf({
      match: mkMatch({ host_id: "u1" }),
      players: [mkPlayer("u1", "alice"), mkGuest("seat-9", "Dave")],
      routes: [mkRoute("a", 1)],
    });
    const tapped = matchReducer(state, {
      type: "upsert-log",
      viewer: host,
      log: mkGuestLog("seat-9", "a", { attempts: 3 }),
    });
    expect(tapped.logs.get(logKey("seat-9", "a"))?.attempts).toBe(3);
    expect(selectBoard(tapped, host).find((r) => r.player_id === "seat-9")?.points).toBe(2);
  });
});
