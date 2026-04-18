import type { JamLog, JamPlayerView, JamRoute } from "@/lib/data/jam-types";

/**
 * Local state model for the live jam screen. Realtime events patch
 * this map in place so the UI paints optimistic-fast without
 * re-fetching `get_jam_state_for_user` on every tick. Truth-of-record
 * is still the server — any mismatch resolves on the next realtime
 * event or a page refresh.
 */
export interface JamLocalState {
  routes: JamRoute[];
  players: JamPlayerView[];
  /** Logs keyed by `${user_id}:${jam_route_id}` for O(1) upsert / remove. */
  logs: Map<string, JamLog>;
}

export type JamAction =
  | { type: "set-routes"; routes: JamRoute[] }
  | { type: "upsert-route"; route: JamRoute }
  | { type: "remove-route"; id: string }
  | { type: "set-players"; players: JamPlayerView[] }
  | { type: "upsert-log"; log: JamLog }
  | { type: "remove-log"; userId: string; routeId: string };

export function logKey(userId: string, routeId: string): string {
  return `${userId}:${routeId}`;
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
      const logs = new Map(state.logs);
      logs.set(logKey(action.log.user_id, action.log.jam_route_id), action.log);
      return { ...state, logs };
    }
    case "remove-log": {
      const logs = new Map(state.logs);
      logs.delete(logKey(action.userId, action.routeId));
      return { ...state, logs };
    }
    default:
      return state;
  }
}
