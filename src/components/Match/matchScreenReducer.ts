import type { MatchLog, MatchPlayerView, MatchRoute, MatchState } from "@/lib/data/match-types";
import { ownerIdOf } from "@/lib/data/match-types";
import { visibleAttempts } from "@/lib/data/logs";

/**
 * Local state model for the live match screen. Realtime events patch
 * this map in place so the UI paints optimistic-fast without
 * re-fetching `get_match_state_for_user` on every tick. Truth-of-record
 * is still the server — any mismatch resolves on the next realtime
 * event or a page refresh.
 *
 * Two invariants live HERE, behind the tested seam, not in the
 * component:
 *
 *   1. **Attempt privacy.** `upsert-log` carries the viewer's id and
 *      the reducer collapses any other player's raw attempt count via
 *      `visibleAttempts` before the log enters state (CLAUDE.md:
 *      "Attempt counts are private"). Realtime ships `match_logs` with
 *      REPLICA IDENTITY FULL, so other-player events arrive with raw
 *      counts — no caller can forget the collapse, because the state
 *      container does it.
 *   2. **One open panel.** Every sheet/menu on the match screen is a
 *      variant of the `panel` union — two sheets can't be open at
 *      once by construction (same shape as SettingsPanel's reducer).
 */
export interface MatchLocalState {
  routes: MatchRoute[];
  players: MatchPlayerView[];
  /** Logs keyed by `${user_id}:${route_id}` for O(1) upsert / remove. */
  logs: Map<string, MatchLog>;
  panel: MatchPanel;
}

/**
 * The one-open-panel union. Sheets that show a route store its id and
 * derive the row at render time, so a route edited (or deleted) via
 * realtime is never rendered stale from a captured snapshot.
 */
export type MatchPanel =
  | { kind: "none" }
  /**
   * Logging a route. `playerId` names a GUEST seat the host is
   * entering for; absent means the caller's own card.
   */
  | { kind: "log"; routeId: string; playerId?: string }
  | { kind: "add" }
  | { kind: "edit"; routeId: string }
  | { kind: "menu" }
  | { kind: "peek"; playerId: string }
  /** Host adding a guest seat. */
  | { kind: "add-guest" }
  /** Declaring a player's limit for the handicap. */
  | { kind: "ceiling"; playerId: string };

export type MatchAction =
  // set-routes / set-players are the full-refresh transitions. A
  // set_players realtime row carries a user_id but no username or
  // avatar, so joins and leaves round-trip the server and come back
  // as a whole roster — see the render-time sync in
  // useMatchScreenState, which is what dispatches set-players.
  | { type: "set-routes"; routes: MatchRoute[] }
  | { type: "upsert-route"; route: MatchRoute }
  | { type: "remove-route"; id: string }
  | { type: "set-players"; players: MatchPlayerView[] }
  /**
   * Seat a guest locally on server success. Idempotent on
   * `player_id`, so the realtime echo (when it arrives) is a no-op —
   * same contract as `upsert-route`.
   */
  | { type: "upsert-player"; player: MatchPlayerView }
  | { type: "remove-player"; playerId: string }
  | { type: "set-ceiling"; playerId: string; ceiling: number | null }
  | { type: "upsert-log"; log: MatchLog; viewerId: string }
  | { type: "remove-log"; userId: string; routeId: string }
  | { type: "open-panel"; panel: MatchPanel }
  | { type: "close-panel" };

export function logKey(userId: string, routeId: string): string {
  return `${userId}:${routeId}`;
}

/** Initial reducer state from the server-rendered match payload.
 *  `my_logs` are the viewer's own rows — raw attempts stay. */
export function initMatchState(initialState: MatchState): MatchLocalState {
  return {
    routes: initialState.routes,
    players: initialState.players,
    // Own logs, plus every guest's when the viewer is the host — the
    // RPC returns an empty `guest_logs` to everyone else, so this is
    // the same map for a non-host as it was before guests existed.
    logs: new Map(
      [...initialState.my_logs, ...initialState.guest_logs].map((log) => [
        logKey(ownerIdOf(log), log.route_id),
        log,
      ]),
    ),
    panel: { kind: "none" },
  };
}

export function matchReducer(
  state: MatchLocalState,
  action: MatchAction,
): MatchLocalState {
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
    case "upsert-player": {
      const players = state.players.filter(
        (p) => p.player_id !== action.player.player_id,
      );
      return { ...state, players: [...players, action.player] };
    }

    case "set-ceiling": {
      return {
        ...state,
        players: state.players.map((p) =>
          p.player_id === action.playerId
            ? { ...p, ceiling: action.ceiling }
            : p,
        ),
      };
    }

    case "remove-player":
      return {
        ...state,
        players: state.players.filter((p) => p.player_id !== action.playerId),
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
      logs.set(logKey(ownerIdOf(log), log.route_id), log);
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
