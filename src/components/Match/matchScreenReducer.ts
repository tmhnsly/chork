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
  /** Anyone in the match inviting friends — a notification, not a seat. */
  | { kind: "invite-friends" }
  /** Declaring a player's limit for the handicap. */
  | { kind: "ceiling"; playerId: string }
  /** The host changing the match's setup before the first route. */
  | { kind: "setup"; section: SetupSection }
  /** The join card as a sheet, once the match is under way. */
  | { kind: "invite" };

export type SetupSection = "game" | "climbing" | "details";

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
  | {
      type: "set-ceiling";
      playerId: string;
      ceiling: number | null;
      altCeiling: number | null;
    }
  | { type: "upsert-log"; log: MatchLog; viewerId: string }
  | { type: "remove-log"; userId: string; routeId: string }
  /**
   * A log deleted elsewhere, from its realtime DELETE, which carries
   * nothing but the row's id (checked 2026-09-15). `remove-log` stays
   * for the local rollback, which knows the owner and route.
   */
  | { type: "remove-log-by-id"; id: string }
  | { type: "open-panel"; panel: MatchPanel }
  | { type: "close-panel" };

export function logKey(userId: string, routeId: string): string {
  return `${userId}:${routeId}`;
}

/**
 * The logs entry holding the log with this id, if any. A realtime DELETE
 * carries only the id (checked 2026-09-15), and logs are keyed by owner
 * and route, so a deleted log is found by value.
 */
export function logEntryById(
  logs: Map<string, MatchLog>,
  id: string,
): [key: string, log: MatchLog] | undefined {
  for (const entry of logs) {
    if (entry[1].id === id) return entry;
  }
  return undefined;
}

/**
 * A live match with no routes yet: setup is still open, and grading
 * locks with the first route. Not a status — derived. There is no
 * lobby screen any more; the name stayed because the rule did.
 */
export function isLobby(state: { routes: unknown[] }): boolean {
  return state.routes.length === 0;
}

/**
 * A seat's realtime event, as much of it as `seatEventOutcome` reads. A
 * DELETE carries only the row's id (checked 2026-09-15).
 */
export type SeatEvent =
  | { eventType: "INSERT" | "UPDATE" }
  | { eventType: "DELETE"; old: { id: string } };

/** What a seat's realtime event means for the live screen. */
export type SeatEventOutcome =
  /** The viewer's own seat was deleted, so the game was. */
  | { kind: "deleted" }
  /**
   * Someone else's seat was deleted: the game is being deleted (the
   * viewer's own seat follows), or that climber's account was.
   */
  | { kind: "gone"; seatId: string }
  /** A join or a leave. A seat row has no name or face; the server has them. */
  | { kind: "refresh" };

/**
 * Leaving parks a seat with `left_at`, and a seat row is deleted only
 * with its game or its account, so the viewer's own seat going means the
 * game went. Anyone else's is taken off the screen by its id. A DELETE
 * never refreshes: a refresh re-rendered a game that was being deleted,
 * bounced the viewer to the join screen, and put a router action in the
 * queue for the screen's own navigation to Games to lose.
 */
export function seatEventOutcome(evt: SeatEvent, viewerSeatId: string | null): SeatEventOutcome {
  if (evt.eventType !== "DELETE") return { kind: "refresh" };
  if (viewerSeatId !== null && evt.old.id === viewerSeatId) return { kind: "deleted" };
  return { kind: "gone", seatId: evt.old.id };
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
      [
        ...initialState.my_logs,
        ...initialState.guest_logs,
        // Everyone else's, already bucketed by SQL (migration 138).
        // Collapsed again with the gate `upsert-log` applies to a
        // realtime row, so a regression in either home can't put a raw
        // count into another player's state.
        ...(initialState.other_logs ?? []).map((log) => ({
          ...log,
          attempts: visibleAttempts(log, false),
        })),
      ].map((log) => [logKey(ownerIdOf(log), log.route_id), log]),
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
      // A withdrawal arrives as an UPDATE, not a DELETE — the row
      // survives so the Chork pen can still read whose go it was. To
      // the room it is gone, so this is the one upsert that removes.
      if (action.route.withdrawn_at !== null) {
        return {
          ...state,
          routes: state.routes.filter((r) => r.id !== action.route.id),
        };
      }
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
            ? { ...p, ceiling: action.ceiling, alt_ceiling: action.altCeiling }
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
    case "remove-log-by-id": {
      const entry = logEntryById(state.logs, action.id);
      if (!entry) return state;
      const logs = new Map(state.logs);
      logs.delete(entry[0]);
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
