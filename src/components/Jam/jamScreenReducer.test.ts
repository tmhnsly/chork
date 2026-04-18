import { describe, expect, it } from "vitest";
import {
  jamReducer,
  logKey,
  type JamAction,
  type JamLocalState,
} from "./jamScreenReducer";
import type { JamLog, JamPlayerView, JamRoute } from "@/lib/data/jam-types";

function mkRoute(id: string, number: number, overrides: Partial<JamRoute> = {}): JamRoute {
  return {
    id,
    jam_id: "jam-1",
    number,
    description: null,
    grade: null,
    has_zone: false,
    added_by: null,
    created_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

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

function mkLog(user_id: string, jam_route_id: string, overrides: Partial<JamLog> = {}): JamLog {
  return {
    id: `${user_id}-${jam_route_id}`,
    jam_id: "jam-1",
    jam_route_id,
    user_id,
    attempts: 1,
    completed: true,
    completed_at: "2026-04-01T10:00:00Z",
    zone: false,
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    ...overrides,
  };
}

const emptyState: JamLocalState = {
  routes: [],
  players: [],
  logs: new Map(),
};

describe("jamReducer", () => {
  describe("set-routes", () => {
    it("replaces the routes array wholesale", () => {
      const state: JamLocalState = { ...emptyState, routes: [mkRoute("a", 1)] };
      const action: JamAction = { type: "set-routes", routes: [mkRoute("b", 2)] };
      const next = jamReducer(state, action);
      expect(next.routes).toHaveLength(1);
      expect(next.routes[0].id).toBe("b");
    });

    it("leaves players + logs untouched", () => {
      const logs = new Map([[logKey("u1", "r1"), mkLog("u1", "r1")]]);
      const state: JamLocalState = {
        routes: [],
        players: [mkPlayer("u1", "alice")],
        logs,
      };
      const next = jamReducer(state, { type: "set-routes", routes: [mkRoute("b", 1)] });
      expect(next.players).toBe(state.players);
      expect(next.logs).toBe(state.logs);
    });
  });

  describe("upsert-route", () => {
    it("appends a new route and keeps the list sorted by number", () => {
      const state: JamLocalState = { ...emptyState, routes: [mkRoute("a", 1), mkRoute("c", 3)] };
      const next = jamReducer(state, {
        type: "upsert-route",
        route: mkRoute("b", 2),
      });
      expect(next.routes.map((r) => r.id)).toEqual(["a", "b", "c"]);
    });

    it("replaces an existing route in place when the id matches", () => {
      const state: JamLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1, { description: "old" })],
      };
      const next = jamReducer(state, {
        type: "upsert-route",
        route: mkRoute("a", 1, { description: "new" }),
      });
      expect(next.routes).toHaveLength(1);
      expect(next.routes[0].description).toBe("new");
    });

    it("re-sorts when an update changes the number", () => {
      const state: JamLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1), mkRoute("b", 2), mkRoute("c", 3)],
      };
      const next = jamReducer(state, {
        type: "upsert-route",
        route: mkRoute("a", 99),
      });
      expect(next.routes.map((r) => r.id)).toEqual(["b", "c", "a"]);
    });
  });

  describe("remove-route", () => {
    it("drops the matching route", () => {
      const state: JamLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1), mkRoute("b", 2), mkRoute("c", 3)],
      };
      const next = jamReducer(state, { type: "remove-route", id: "b" });
      expect(next.routes.map((r) => r.id)).toEqual(["a", "c"]);
    });

    it("is a no-op when the id isn't present", () => {
      const state: JamLocalState = { ...emptyState, routes: [mkRoute("a", 1)] };
      const next = jamReducer(state, { type: "remove-route", id: "zzz" });
      expect(next.routes).toHaveLength(1);
      expect(next.routes[0].id).toBe("a");
    });

    it("reads from CURRENT state — shields against a stale-closure delete", () => {
      // Regression: the realtime DELETE handler used to close over
      // `state.routes` and filter by id, which would drop a newly-
      // upserted route if the closure was stale. Moving the delete
      // into the reducer fixed that; this test enshrines it.
      const state: JamLocalState = {
        ...emptyState,
        routes: [mkRoute("a", 1), mkRoute("b", 2)],
      };
      const afterUpsert = jamReducer(state, {
        type: "upsert-route",
        route: mkRoute("c", 3),
      });
      // Now delete 'b' from the post-upsert state — 'c' must survive.
      const afterDelete = jamReducer(afterUpsert, { type: "remove-route", id: "b" });
      expect(afterDelete.routes.map((r) => r.id)).toEqual(["a", "c"]);
    });
  });

  describe("set-players", () => {
    it("replaces the players array", () => {
      const state: JamLocalState = {
        ...emptyState,
        players: [mkPlayer("u1", "alice")],
      };
      const next = jamReducer(state, {
        type: "set-players",
        players: [mkPlayer("u2", "bob")],
      });
      expect(next.players.map((p) => p.username)).toEqual(["bob"]);
    });
  });

  describe("upsert-log", () => {
    it("inserts a new log keyed on user + route", () => {
      const next = jamReducer(emptyState, {
        type: "upsert-log",
        log: mkLog("u1", "r1"),
      });
      expect(next.logs.size).toBe(1);
      expect(next.logs.get(logKey("u1", "r1"))).toBeTruthy();
    });

    it("updates the log for the same (user, route) pair", () => {
      const state: JamLocalState = {
        ...emptyState,
        logs: new Map([[logKey("u1", "r1"), mkLog("u1", "r1", { attempts: 1 })]]),
      };
      const next = jamReducer(state, {
        type: "upsert-log",
        log: mkLog("u1", "r1", { attempts: 3 }),
      });
      expect(next.logs.size).toBe(1);
      expect(next.logs.get(logKey("u1", "r1"))?.attempts).toBe(3);
    });

    it("never mutates the caller's Map — returns a fresh one", () => {
      const logs = new Map<string, JamLog>();
      const state: JamLocalState = { ...emptyState, logs };
      const next = jamReducer(state, {
        type: "upsert-log",
        log: mkLog("u1", "r1"),
      });
      expect(next.logs).not.toBe(logs);
      expect(logs.size).toBe(0);
    });
  });

  describe("remove-log", () => {
    it("deletes the log for the specified (user, route)", () => {
      const logs = new Map([
        [logKey("u1", "r1"), mkLog("u1", "r1")],
        [logKey("u2", "r1"), mkLog("u2", "r1")],
      ]);
      const next = jamReducer(
        { ...emptyState, logs },
        { type: "remove-log", userId: "u1", routeId: "r1" },
      );
      expect(next.logs.size).toBe(1);
      expect(next.logs.has(logKey("u1", "r1"))).toBe(false);
      expect(next.logs.has(logKey("u2", "r1"))).toBe(true);
    });

    it("is a no-op on a missing key", () => {
      const state: JamLocalState = { ...emptyState };
      const next = jamReducer(state, {
        type: "remove-log",
        userId: "ghost",
        routeId: "rX",
      });
      expect(next.logs.size).toBe(0);
    });
  });
});
