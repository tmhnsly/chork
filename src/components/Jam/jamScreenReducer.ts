import type { JamLog, JamPlayerView, JamRoute, JamState } from "@/lib/data/jam-types";
import { visibleAttempts } from "@/lib/data/logs";

/**
 * Local state model for the live jam screen. Realtime events patch
 * this map in place so the UI paints optimistic-fast without
 * re-fetching `get_jam_state_for_user` on every tick. Truth-of-record
 * is still the server — any mismatch resolves on the next realtime
 * event or a page refresh.
 *
 * Two invariants live HERE, behind the tested seam, not in the
 * component:
 *
 *   1. **Attempt privacy.** `upsert-log` carries the viewer's id and
 *      the reducer collapses any other player's raw attempt count via
 *      `visibleAttempts` before the log enters state (CLAUDE.md:
 *      "Attempt counts are private"). Realtime ships `jam_logs` with
 *      REPLICA IDENTITY FULL, so other-player events arrive with raw
 *      counts — no caller can forget the collapse, because the state
 *      container does it.
 *   2. **One open panel.** Every sheet/menu on the jam screen is a
 *      variant of the `panel` union — two sheets can't be open at
 *      once by construction (same shape as SettingsPanel's reducer).
 */
export interface JamLocalState {
  routes: JamRoute[];
  players: JamPlayerView[];
  /** Logs keyed by `${user_id}:${jam_route_id}` for O(1) upsert / remove. */
  logs: Map<string, JamLog>;
  panel: JamPanel;
}

/**
 * The one-open-panel union. Sheets that show a route store its id and
 * derive the row at render time, so a route edited (or deleted) via
 * realtime is never rendered stale from a captured snapshot.
 */
export type JamPanel =
  | { kind: "none" }
  | { kind: "log"; routeId: string }
  | { kind: "add" }
  | { kind: "edit"; routeId: string }
  | { kind: "menu" }
  | { kind: "peek"; playerId: string };

export type JamAction =
  // set-routes / set-players are the full-refresh transitions for the
  // live-player realtime wiring (roadmap: jams overhaul) — set-players
  // has no production dispatcher YET because the join/leave events
  // currently trigger a router.refresh() instead.
  | { type: "set-routes"; routes: JamRoute[] }
  | { type: "upsert-route"; route: JamRoute }
  | { type: "remove-route"; id: string }
  | { type: "set-players"; players: JamPlayerView[] }
  | { type: "upsert-log"; log: JamLog; viewerId: string }
  | { type: "remove-log"; userId: string; routeId: string }
  | { type: "open-panel"; panel: JamPanel }
  | { type: "close-panel" };

export function logKey(userId: string, routeId: string): string {
  return `${userId}:${routeId}`;
}

/** Initial reducer state from the server-rendered jam payload.
 *  `my_logs` are the viewer's own rows — raw attempts stay. */
export function initJamState(initialState: JamState): JamLocalState {
  return {
    routes: initialState.routes,
    players: initialState.players,
    logs: new Map(
      initialState.my_logs.map((log) => [
        logKey(log.user_id, log.jam_route_id),
        log,
      ]),
    ),
    panel: { kind: "none" },
  };
}

export function jamReducer(
  state: JamLocalState,
  action: JamAction,
): JamLocalState {
  switch (action.type) {
    case "set-routes":
      return { ...state, routes: action.routes };
    case "upsert-route": {
      const existingIdx = state.routes.findIndex(
        (r) => r.id === action.route.id,
      );
      const next =
        existingIdx >= 0
          ? state.routes.map((r) =>
              r.id === action.route.id ? action.route : r,
            )
          : [...state.routes, action.route];
      next.sort((a, b) => a.number - b.number);
      return { ...state, routes: next };
    }
    case "remove-route":
      return {
        ...state,
        routes: state.routes.filter((r) => r.id !== action.id),
      };
    case "set-players":
      return { ...state, players: action.players };
    case "upsert-log": {
      // Privacy gate — see the module doc. Own logs keep raw attempts
      // (points preview + log sheet need them); everyone else's
      // collapse to the flash/completion buckets.
      const log =
        action.log.user_id === action.viewerId
          ? action.log
          : { ...action.log, attempts: visibleAttempts(action.log, false) };
      const logs = new Map(state.logs);
      logs.set(logKey(log.user_id, log.jam_route_id), log);
      return { ...state, logs };
    }
    case "remove-log": {
      const logs = new Map(state.logs);
      logs.delete(logKey(action.userId, action.routeId));
      return { ...state, logs };
    }
    case "open-panel":
      return { ...state, panel: action.panel };
    case "close-panel":
      return { ...state, panel: { kind: "none" } };
    default:
      return state;
  }
}
