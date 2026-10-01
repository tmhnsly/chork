import { describe, expect, it } from "vitest";
import {
  allowanceKey,
  initMatchState,
  matchReducer,
  logKey,
  logEntryById,
  isLobby,
  type MatchLocalState,
} from "./matchScreenReducer";
import type { ChorkStanding, MatchLeaderboardRow, MatchLog, MatchState } from "@/lib/data/match-types";
import { mkBundle, mkLog, mkMatch, mkPlayer, mkRoute } from "@/test/match-fixtures";

const emptyState: MatchLocalState = initMatchState(mkBundle());

describe("matchReducer", () => {
  describe("upsert-route", () => {
    it("appends a new route and keeps the list sorted by number", () => {
      const state: MatchLocalState = { ...emptyState, routes: [mkRoute("a", 1), mkRoute("c", 3)] };
      const next = matchReducer(state, {
        type: "upsert-route",
        route: mkRoute("b", 2),
      });
      expect(next.routes.map((r) => r.id)).toEqual(["a", "b", "c"]);
    });

    it("replaces an existing route in place when the id matches", () => {
      const state: MatchLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1, { description: "old" })],
      };
      const next = matchReducer(state, {
        type: "upsert-route",
        route: mkRoute("a", 1, { description: "new" }),
      });
      expect(next.routes).toHaveLength(1);
      expect(next.routes[0].description).toBe("new");
    });

    it("re-sorts when an update changes the number", () => {
      const state: MatchLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1), mkRoute("b", 2), mkRoute("c", 3)],
      };
      const next = matchReducer(state, {
        type: "upsert-route",
        route: mkRoute("a", 99),
      });
      expect(next.routes.map((r) => r.id)).toEqual(["b", "c", "a"]);
    });
  });

  describe("remove-route", () => {
    it("drops the matching route", () => {
      const state: MatchLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1), mkRoute("b", 2), mkRoute("c", 3)],
      };
      const next = matchReducer(state, { type: "remove-route", id: "b" });
      expect(next.routes.map((r) => r.id)).toEqual(["a", "c"]);
    });

    it("is a no-op when the id isn't present", () => {
      const state: MatchLocalState = { ...emptyState, routes: [mkRoute("a", 1)] };
      const next = matchReducer(state, { type: "remove-route", id: "zzz" });
      expect(next.routes).toHaveLength(1);
      expect(next.routes[0].id).toBe("a");
    });

    it("reads from CURRENT state — shields against a stale-closure delete", () => {
      // Regression: the realtime DELETE handler used to close over
      // `state.routes` and filter by id, which would drop a newly-
      // upserted route if the closure was stale. Moving the delete
      // into the reducer fixed that; this test enshrines it.
      const state: MatchLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1), mkRoute("b", 2)],
      };
      const afterUpsert = matchReducer(state, {
        type: "upsert-route",
        route: mkRoute("c", 3),
      });
      // Now delete 'b' from the post-upsert state — 'c' must survive.
      const afterDelete = matchReducer(afterUpsert, { type: "remove-route", id: "b" });
      expect(afterDelete.routes.map((r) => r.id)).toEqual(["a", "c"]);
    });
  });

  describe("upsert-log", () => {
    it("inserts a new log keyed on user + route", () => {
      const next = matchReducer(emptyState, {
        type: "upsert-log",
        log: mkLog("u1", "r1"),
        viewer: { userId: "u1", isHost: false },
      });
      expect(next.logs.size).toBe(1);
      expect(next.logs.get(logKey("u1", "r1"))).toBeTruthy();
    });

    it("updates the log for the same (user, route) pair", () => {
      const state: MatchLocalState = {
        ...emptyState,
        logs: new Map([[logKey("u1", "r1"), mkLog("u1", "r1", { attempts: 1 })]]),
      };
      const next = matchReducer(state, {
        type: "upsert-log",
        log: mkLog("u1", "r1", { attempts: 3 }),
        viewer: { userId: "u1", isHost: false },
      });
      expect(next.logs.size).toBe(1);
      expect(next.logs.get(logKey("u1", "r1"))?.attempts).toBe(3);
    });

    it("never mutates the caller's Map — returns a fresh one", () => {
      const logs = new Map<string, MatchLog>();
      const state: MatchLocalState = { ...emptyState, logs };
      const next = matchReducer(state, {
        type: "upsert-log",
        log: mkLog("u1", "r1"),
        viewer: { userId: "u1", isHost: false },
      });
      expect(next.logs).not.toBe(logs);
      expect(logs.size).toBe(0);
    });
  });

  // ── Privacy gate ──────────────────────────────────────────────
  // CLAUDE.md: "Attempt counts are private — never show raw attempts
  // to other users." Realtime ships match_logs with REPLICA IDENTITY
  // FULL, so other-player events arrive with raw counts; the reducer
  // is the single gate that collapses them before they enter state.
  // This invariant used to live in an untestable inline branch of
  // MatchScreen's realtime callback.
  describe("upsert-log privacy gate", () => {
    it("keeps the viewer's own raw attempt count", () => {
      const next = matchReducer(emptyState, {
        type: "upsert-log",
        log: mkLog("me", "r1", { attempts: 7, completed: true }),
        viewer: { userId: "me", isHost: false },
      });
      expect(next.logs.get(logKey("me", "r1"))?.attempts).toBe(7);
    });

    // A guest's log has no `user_id`. The gate compared it with the
    // viewer's id, so the host's own entries for a guest were collapsed
    // like a stranger's, then scored on the host's phone from the
    // collapsed count, and an unsent route reopened at 0 goes.
    const guestLog = (overrides: Partial<MatchLog>): MatchLog => ({
      ...mkLog("unused", "r1", overrides),
      user_id: null,
      player_id: "seat-9",
    });

    it("keeps a guest's raw count for the host, who typed it in", () => {
      const host = { userId: "me", isHost: true };
      const sent = matchReducer(emptyState, {
        type: "upsert-log",
        log: guestLog({ attempts: 3, completed: true }),
        viewer: host,
      });
      const unsent = matchReducer(emptyState, {
        type: "upsert-log",
        log: guestLog({ attempts: 4, completed: false, completed_at: null }),
        viewer: host,
      });
      expect(sent.logs.get(logKey("seat-9", "r1"))?.attempts).toBe(3);
      expect(unsent.logs.get(logKey("seat-9", "r1"))?.attempts).toBe(4);
    });

    it("collapses a guest's count for everyone who isn't the host", () => {
      const next = matchReducer(emptyState, {
        type: "upsert-log",
        log: guestLog({ attempts: 3, completed: true }),
        viewer: { userId: "me", isHost: false },
      });
      expect(next.logs.get(logKey("seat-9", "r1"))?.attempts).toBe(2);
    });

    it("collapses another player's non-flash completion to the bucket value", () => {
      const next = matchReducer(emptyState, {
        type: "upsert-log",
        log: mkLog("them", "r1", { attempts: 7, completed: true }),
        viewer: { userId: "me", isHost: false },
      });
      // visibleAttempts: non-flash completion → 2 (uniform bucket).
      expect(next.logs.get(logKey("them", "r1"))?.attempts).toBe(2);
    });

    it("collapses another player's uncompleted attempts to 0 (no 'in progress' signal)", () => {
      const next = matchReducer(emptyState, {
        type: "upsert-log",
        log: mkLog("them", "r1", { attempts: 5, completed: false }),
        viewer: { userId: "me", isHost: false },
      });
      expect(next.logs.get(logKey("them", "r1"))?.attempts).toBe(0);
    });

    it("preserves another player's flash (attempts 1 stays 1)", () => {
      const next = matchReducer(emptyState, {
        type: "upsert-log",
        log: mkLog("them", "r1", { attempts: 1, completed: true }),
        viewer: { userId: "me", isHost: false },
      });
      expect(next.logs.get(logKey("them", "r1"))?.attempts).toBe(1);
    });

    it("never lets a raw attempt count above the bucket ceiling enter state for another player", () => {
      // Sweep a range of raw counts — whatever arrives, the stored
      // value for a non-viewer is always in {0, 1, 2}.
      for (const attempts of [0, 1, 2, 3, 4, 10, 99]) {
        for (const completed of [true, false]) {
          const next = matchReducer(emptyState, {
            type: "upsert-log",
            log: mkLog("them", "r1", { attempts, completed }),
            viewer: { userId: "me", isHost: false },
          });
          const stored = next.logs.get(logKey("them", "r1"))!.attempts;
          expect([0, 1, 2]).toContain(stored);
        }
      }
    });

    it("leaves zone status untouched for other players (zone is public)", () => {
      const next = matchReducer(emptyState, {
        type: "upsert-log",
        log: mkLog("them", "r1", { attempts: 4, completed: false, zone: true }),
        viewer: { userId: "me", isHost: false },
      });
      expect(next.logs.get(logKey("them", "r1"))?.zone).toBe(true);
    });
  });

  // ── One open panel ────────────────────────────────────────────
  describe("panels", () => {
    it("opening a panel replaces whatever was open — two can't coexist", () => {
      const afterLog = matchReducer(emptyState, {
        type: "open-panel",
        panel: { kind: "log", routeId: "r1" },
      });
      const afterMenu = matchReducer(afterLog, {
        type: "open-panel",
        panel: { kind: "menu" },
      });
      expect(afterMenu.panel).toEqual({ kind: "menu" });
    });

    it("close-panel returns to none", () => {
      const open = matchReducer(emptyState, {
        type: "open-panel",
        panel: { kind: "peek", playerId: "u2" },
      });
      expect(matchReducer(open, { type: "close-panel" }).panel).toEqual({
        kind: "none",
      });
    });

    it("panel changes leave routes / players / logs untouched", () => {
      const logs = new Map([[logKey("u1", "r1"), mkLog("u1", "r1")]]);
      const state: MatchLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1)],
        players: [mkPlayer("u1", "alice")],
        logs,
      };
      const next = matchReducer(state, {
        type: "open-panel",
        panel: { kind: "add" },
      });
      expect(next.routes).toBe(state.routes);
      expect(next.players).toBe(state.players);
      expect(next.logs).toBe(state.logs);
    });
  });

  describe("initMatchState", () => {
    it("keys the viewer's own logs and starts with no panel open", () => {
      const initial = {
        match: { id: "match-1" },
        routes: [mkRoute("a", 1)],
        players: [mkPlayer("u1", "alice")],
        my_logs: [mkLog("u1", "a", { attempts: 4 })],
        guest_logs: [],
        grades: [],
        leaderboard: [],
      } as unknown as MatchState;
      const state = initMatchState(initial);
      expect(state.panel).toEqual({ kind: "none" });
      // Own logs keep raw attempts — they arrive from
      // get_match_state_for_user already scoped to the viewer.
      expect(state.logs.get(logKey("u1", "a"))?.attempts).toBe(4);
    });

    it("seats guest logs alongside the viewer's own", () => {
      // `guest_logs` is non-empty only for the host, who entered
      // them. Keyed by SEAT, since a guest has no user_id.
      const initial = {
        match: { id: "match-1" },
        routes: [mkRoute("a", 1)],
        players: [mkPlayer("u1", "alice")],
        my_logs: [mkLog("u1", "a", { attempts: 4 })],
        guest_logs: [
          { ...mkLog("u1", "a", { attempts: 2 }), user_id: null, player_id: "seat-9" },
        ],
        grades: [],
        leaderboard: [],
      } as unknown as MatchState;
      const state = initMatchState(initial);
      expect(state.logs.get(logKey("u1", "a"))?.attempts).toBe(4);
      expect(state.logs.get(logKey("seat-9", "a"))?.attempts).toBe(2);
    });

    it("seats every other player's logs, collapsed to the public buckets", () => {
      // Found at Yonder: after a reload, other players' tiles were blank
      // because only the viewer's logs were seeded. \`other_logs\` arrive
      // already bucketed from SQL; the reducer collapses again, so a
      // regression in either home can't put a raw count into state.
      const initial = {
        match: { id: "match-1" },
        routes: [mkRoute("a", 1), mkRoute("b", 2), mkRoute("c", 3)],
        players: [mkPlayer("u1", "alice"), mkPlayer("u2", "bob")],
        my_logs: [mkLog("u1", "a", { attempts: 4 })],
        guest_logs: [],
        other_logs: [
          mkLog("u2", "a", { attempts: 5, completed: true }),
          mkLog("u2", "b", { attempts: 3, completed: false, completed_at: null }),
          mkLog("u2", "c", { attempts: 1, completed: true }),
        ],
        grades: [],
        leaderboard: [],
      } as unknown as MatchState;
      const state = initMatchState(initial);
      expect(state.logs.get(logKey("u1", "a"))?.attempts).toBe(4);
      expect(state.logs.get(logKey("u2", "a"))?.attempts).toBe(2);
      expect(state.logs.get(logKey("u2", "b"))?.attempts).toBe(0);
      expect(state.logs.get(logKey("u2", "c"))?.attempts).toBe(1);
    });

    it("tolerates a bundle without other_logs, as one served before the migration", () => {
      const initial = {
        match: { id: "match-1" },
        routes: [],
        players: [],
        my_logs: [],
        guest_logs: [],
        grades: [],
        leaderboard: [],
      } as unknown as MatchState;
      expect(initMatchState(initial).logs.size).toBe(0);
    });
  });

  describe("initMatchState withdrawn routes", () => {
    it("leaves a withdrawn route off the wall, as upsert-route does live", () => {
      const initial = {
        match: { id: "match-1" },
        routes: [mkRoute("a", 1), mkRoute("b", 2, { withdrawn_at: "2026-04-01T11:00:00Z" })],
        players: [],
        my_logs: [],
        guest_logs: [],
        grades: [],
        leaderboard: [],
      } as unknown as MatchState;
      expect(initMatchState(initial).routes.map((r) => r.id)).toEqual(["a"]);
    });
  });

  describe("pending writes", () => {
    const viewer = { userId: "u1", isHost: false };
    const key = logKey("u1", "a");
    const tap = (state: MatchLocalState) =>
      matchReducer(state, { type: "upsert-log", viewer, pending: true, log: mkLog("u1", "a", { attempts: 2 }) });

    it("an optimistic tap is pending", () => {
      expect(tap(emptyState).pending.has(key)).toBe(true);
    });

    it("the server accepting it settles it", () => {
      const next = matchReducer(tap(emptyState), { type: "settle-log", ownerId: "u1", routeId: "a" });
      expect(next.pending.has(key)).toBe(false);
      expect(next.logs.get(key)?.attempts).toBe(2);
    });

    it("its realtime echo settles it (a queued write's only confirmation)", () => {
      const next = matchReducer(tap(emptyState), { type: "upsert-log", viewer, log: mkLog("u1", "a", { attempts: 2 }) });
      expect(next.pending.has(key)).toBe(false);
    });

    it("a rollback settles it", () => {
      expect(matchReducer(tap(emptyState), { type: "remove-log", userId: "u1", routeId: "a" }).pending.has(key)).toBe(false);
    });

    it("settling something not pending is a no-op", () => {
      expect(matchReducer(emptyState, { type: "settle-log", ownerId: "u1", routeId: "a" })).toBe(emptyState);
    });
  });

  describe("sync", () => {
    // Realtime never replays what it sent while a socket was down. Found
    // in a live game: a route put up while a phone was locked never
    // reached it, while the scores caught up on the next log.
    function bundle(overrides: Partial<MatchState> = {}): MatchState {
      return {
        match: { id: "match-1", host_id: "host" },
        routes: [],
        players: [],
        my_logs: [],
        guest_logs: [],
        other_logs: [],
        grades: [],
        leaderboard: [],
        ...overrides,
      } as unknown as MatchState;
    }
    const sync = (state: MatchLocalState, b: MatchState) => matchReducer(state, { type: "sync", bundle: b });
    const withLogs = (entries: Array<[string, MatchLog]>, pending: string[] = []): MatchLocalState => ({
      ...emptyState,
      logs: new Map(entries),
      pending: new Set(pending),
    });

    it("brings in a route the realtime feed missed", () => {
      const state = { ...emptyState, routes: [mkRoute("a", 1)] };
      const next = sync(state, bundle({ routes: [mkRoute("a", 1), mkRoute("b", 2)] }));
      expect(next.routes.map((r) => r.id)).toEqual(["a", "b"]);
    });

    it("drops a route withdrawn while the feed was down", () => {
      const state = { ...emptyState, routes: [mkRoute("a", 1), mkRoute("b", 2)] };
      const next = sync(
        state,
        bundle({
          routes: [mkRoute("a", 1), mkRoute("b", 2, { withdrawn_at: "2026-04-01T11:00:00Z" })],
        }),
      );
      expect(next.routes.map((r) => r.id)).toEqual(["a"]);
    });

    it("keeps a route put up after the snapshot was read", () => {
      // This device's own add paints on server success, which can land
      // before a refresh that started earlier.
      const state = { ...emptyState, routes: [mkRoute("a", 1), mkRoute("b", 2)] };
      const next = sync(state, bundle({ routes: [mkRoute("a", 1)] }));
      expect(next.routes.map((r) => r.id)).toEqual(["a", "b"]);
    });

    it("reads the high-water mark through withdrawn routes", () => {
      // Route 2 was withdrawn while away. The bundle still carries it,
      // so the local copy isn't mistaken for one added after the snapshot.
      const state = { ...emptyState, routes: [mkRoute("a", 1), mkRoute("b", 2)] };
      const next = sync(
        state,
        bundle({
          routes: [mkRoute("a", 1), mkRoute("b", 2, { withdrawn_at: "2026-04-01T11:00:00Z" })],
        }),
      );
      expect(next.routes.map((r) => r.id)).not.toContain("b");
    });

    it("fills in another player's log the feed missed, collapsed", () => {
      const next = sync(
        emptyState,
        bundle({ other_logs: [mkLog("u2", "a", { attempts: 5, completed: true })] }),
      );
      expect(next.logs.get(logKey("u2", "a"))?.attempts).toBe(2);
    });

    it("keeps the viewer's own PENDING log over a snapshot that predates the tap", () => {
      // The phone's clock stamped the tap earlier than the server's copy
      // of the previous write: only `pending` can tell them apart.
      const tap = mkLog("u1", "a", { attempts: 3, updated_at: "2026-04-01T09:00:00Z" });
      const next = sync(
        withLogs([[logKey("u1", "a"), tap]], [logKey("u1", "a")]),
        bundle({ my_logs: [mkLog("u1", "a", { attempts: 1, updated_at: "2026-04-01T10:00:00Z" })] }),
      );
      expect(next.logs.get(logKey("u1", "a"))?.attempts).toBe(3);
    });

    it("heals the viewer's own log when the screen mounted stale (not pending)", () => {
      // The regression: back to a game inside the router cache's minute,
      // the mount's bundle predates your send, and the resync used to keep
      // the stale local copy because it was yours — the tile stayed
      // "attempted" while the board said "sent".
      const stale = mkLog("u1", "a", { attempts: 1, completed: false, updated_at: "2026-04-01T09:00:00Z" });
      const next = sync(
        withLogs([[logKey("u1", "a"), stale]]),
        bundle({ my_logs: [mkLog("u1", "a", { attempts: 2, completed: true, updated_at: "2026-04-01T10:00:00Z" })] }),
      );
      expect(next.logs.get(logKey("u1", "a"))?.completed).toBe(true);
    });

    it("keeps the host's pending guest log over the snapshot", () => {
      const guest = { ...mkLog("u1", "a", { attempts: 4 }), user_id: null, player_id: "seat-9" };
      const next = sync(
        withLogs([[logKey("seat-9", "a"), guest]], [logKey("seat-9", "a")]),
        bundle({ match: { id: "match-1", host_id: "u1" } as MatchState["match"], guest_logs: [{ ...guest, attempts: 1, updated_at: "2026-04-01T12:00:00Z" }] }),
      );
      expect(next.logs.get(logKey("seat-9", "a"))?.attempts).toBe(4);
    });

    it("heals a host's settled guest log from a newer snapshot", () => {
      const guest = { ...mkLog("u1", "a", { attempts: 4, updated_at: "2026-04-01T09:00:00Z" }), user_id: null, player_id: "seat-9" };
      const next = sync(
        withLogs([[logKey("seat-9", "a"), guest]]),
        bundle({ match: { id: "match-1", host_id: "u1" } as MatchState["match"], guest_logs: [{ ...guest, attempts: 1, updated_at: "2026-04-01T12:00:00Z" }] }),
      );
      expect(next.logs.get(logKey("seat-9", "a"))?.attempts).toBe(1);
    });

    it("keeps a newer realtime copy of the viewer's own log over a slower snapshot", () => {
      const echo = mkLog("u1", "a", { attempts: 2, completed: true, updated_at: "2026-04-01T12:00:00Z" });
      const next = sync(
        withLogs([[logKey("u1", "a"), echo]]),
        bundle({ my_logs: [mkLog("u1", "a", { attempts: 1, completed: false, updated_at: "2026-04-01T10:00:00Z" })] }),
      );
      expect(next.logs.get(logKey("u1", "a"))?.completed).toBe(true);
    });

    it("keeps a newer realtime copy of someone else's log over a slower snapshot", () => {
      const fresh = mkLog("u2", "a", { attempts: 1, updated_at: "2026-04-01T12:00:00Z" });
      const state = { ...emptyState, logs: new Map([[logKey("u2", "a"), fresh]]) };
      const next = sync(
        state,
        bundle({
          other_logs: [mkLog("u2", "a", { attempts: 0, completed: false, updated_at: "2026-04-01T10:00:00Z" })],
        }),
      );
      expect(next.logs.get(logKey("u2", "a"))?.completed).toBe(true);
    });

    it("takes the server's copy of someone else's log when it is newer", () => {
      const stale = mkLog("u2", "a", { attempts: 0, completed: false, updated_at: "2026-04-01T10:00:00Z" });
      const state = { ...emptyState, logs: new Map([[logKey("u2", "a"), stale]]) };
      const next = sync(
        state,
        bundle({ other_logs: [mkLog("u2", "a", { attempts: 1, updated_at: "2026-04-01T12:00:00Z" })] }),
      );
      expect(next.logs.get(logKey("u2", "a"))?.completed).toBe(true);
    });

    it("takes the Match row, its grades, the roster and the server's board from the bundle", () => {
      // These are the server's to say. Each used to have its own
      // render-time sync, or none: the setup was read off props, and a
      // roster re-seeded only when someone joined or left, which threw
      // a newly declared limit away.
      const state = {
        ...emptyState,
        players: [mkPlayer("u1", "alice")],
      };
      const row = { player_id: "u1", points: 7 } as MatchLeaderboardRow;
      const next = sync(
        state,
        bundle({
          match: mkMatch({ name: "Friday session", handicap: true }),
          grades: [{ ordinal: 0, label: "Easy" }],
          players: [mkPlayer("u1", "alice", { ceiling: 5, alt_ceiling: 3 }), mkPlayer("u2", "bob")],
          leaderboard: [row],
        }),
      );
      expect(next.match.name).toBe("Friday session");
      expect(next.match.handicap).toBe(true);
      expect(next.grades).toEqual([{ ordinal: 0, label: "Easy" }]);
      expect(next.players.map((p) => [p.username, p.ceiling, p.alt_ceiling])).toEqual([
        ["alice", 5, 3],
        ["bob", null, null],
      ]);
      expect(next.board).toEqual([row]);
    });

    it("keeps Chork's standings and the open round's allowance, which no bundle carries", () => {
      const state = matchReducer(
        matchReducer(emptyState, {
          type: "set-chork",
          standings: [{ player_id: "u1", letters: 2, has_pen: true } as ChorkStanding],
        }),
        { type: "set-allowance", routeId: "r1", value: 3 },
      );
      const next = sync(state, bundle());
      expect(next.chork.letters.get("u1")).toBe(2);
      expect(next.chork.penSeatId).toBe("u1");
      expect(next.allowance).toEqual({ key: allowanceKey("r1"), value: 3 });
    });

    it("leaves the open panel alone", () => {
      const state = { ...emptyState, panel: { kind: "add" } as const };
      expect(sync(state, bundle()).panel).toEqual({ kind: "add" });
    });
  });

  describe("what only the server can say", () => {
    it("set-match replaces the Match row and nothing else", () => {
      const state = { ...emptyState, routes: [mkRoute("a", 1)] };
      const next = matchReducer(state, {
        type: "set-match",
        match: mkMatch({ game_mode: "chork", location: "The Arch" }),
      });
      expect(next.match.game_mode).toBe("chork");
      expect(next.match.location).toBe("The Arch");
      expect(next.routes).toBe(state.routes);
    });

    it("set-board replaces the server's board", () => {
      const rows = [{ player_id: "u2", points: 4 } as MatchLeaderboardRow];
      expect(matchReducer(emptyState, { type: "set-board", rows }).board).toBe(rows);
    });

    it("set-chork keeps letters by seat and finds the pen", () => {
      const next = matchReducer(emptyState, {
        type: "set-chork",
        standings: [
          { player_id: "u1", letters: 1, has_pen: false },
          { player_id: "seat-9", letters: 3, has_pen: true },
        ] as ChorkStanding[],
      });
      expect([...next.chork.letters]).toEqual([
        ["u1", 1],
        ["seat-9", 3],
      ]);
      expect(next.chork.penSeatId).toBe("seat-9");
    });

    it("set-chork leaves the pen unknown when nobody holds it", () => {
      const next = matchReducer(emptyState, {
        type: "set-chork",
        standings: [{ player_id: "u1", letters: 0, has_pen: false }] as ChorkStanding[],
      });
      expect(next.chork.penSeatId).toBeNull();
    });

    it("set-allowance keys a guest's round by their seat and the viewer's own by 'me'", () => {
      const own = matchReducer(emptyState, { type: "set-allowance", routeId: "r1", value: 2 });
      const guest = matchReducer(emptyState, {
        type: "set-allowance",
        routeId: "r1",
        seatId: "seat-9",
        value: 4,
      });
      expect(own.allowance).toEqual({ key: "r1:me", value: 2 });
      expect(guest.allowance).toEqual({ key: "r1:seat-9", value: 4 });
      expect(allowanceKey("r1", null)).toBe("r1:me");
    });
  });

  describe("remove-log", () => {
    it("deletes the log for the specified (user, route)", () => {
      const logs = new Map([
        [logKey("u1", "r1"), mkLog("u1", "r1")],
        [logKey("u2", "r1"), mkLog("u2", "r1")],
      ]);
      const next = matchReducer(
        { ...emptyState, logs },
        { type: "remove-log", userId: "u1", routeId: "r1" },
      );
      expect(next.logs.size).toBe(1);
      expect(next.logs.has(logKey("u1", "r1"))).toBe(false);
      expect(next.logs.has(logKey("u2", "r1"))).toBe(true);
    });

    it("is a no-op on a missing key", () => {
      const state: MatchLocalState = { ...emptyState };
      const next = matchReducer(state, {
        type: "remove-log",
        userId: "ghost",
        routeId: "rX",
      });
      expect(next.logs.size).toBe(0);
    });
  });

  describe("remove-log-by-id", () => {
    it("deletes the log with that id, whoever owns it", () => {
      const logs = new Map([
        [logKey("u1", "r1"), mkLog("u1", "r1")],
        [logKey("u2", "r1"), mkLog("u2", "r1")],
      ]);
      const next = matchReducer({ ...emptyState, logs }, { type: "remove-log-by-id", id: "u1-r1" });
      expect(next.logs.size).toBe(1);
      expect(next.logs.has(logKey("u1", "r1"))).toBe(false);
      expect(next.logs.has(logKey("u2", "r1"))).toBe(true);
    });

    it("returns the same state for an id it doesn't hold", () => {
      const state: MatchLocalState = {
        ...emptyState,
        logs: new Map([[logKey("u1", "r1"), mkLog("u1", "r1")]]),
      };
      expect(matchReducer(state, { type: "remove-log-by-id", id: "ghost" })).toBe(state);
    });
  });
});

describe("isLobby", () => {
  it("is the lobby while no route exists", () => {
    expect(isLobby({ routes: [] })).toBe(true);
  });
  it("stops being the lobby at the first route", () => {
    expect(isLobby({ routes: [{ id: "r1" }] })).toBe(false);
  });
});

describe("logEntryById", () => {
  it("finds a log by its id, whatever its key", () => {
    const log = mkLog("u1", "r1");
    const logs = new Map([[logKey("u1", "r1"), log]]);
    expect(logEntryById(logs, "u1-r1")).toEqual([logKey("u1", "r1"), log]);
  });

  it("returns undefined for an id it doesn't hold", () => {
    expect(logEntryById(new Map(), "ghost")).toBeUndefined();
  });
});
