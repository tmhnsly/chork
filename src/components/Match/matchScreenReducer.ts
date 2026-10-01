import type {
  ChorkStanding,
  Match,
  MatchLeaderboardRow,
  MatchLog,
  MatchPlayerView,
  MatchRoute,
  MatchState,
} from "@/lib/data/match-types";
import { entersLogsFor, ownerIdOf, type SeatViewer } from "@/lib/data/seat";
import { visibleAttempts } from "@/lib/data/logs";

/**
 * What this device believes about the Match: the one model the live
 * screen paints from.
 *
 * Realtime events patch it so the UI paints fast without re-fetching
 * `get_match_state_for_user` on every tick; a fresh bundle (`sync`)
 * repairs whatever the events missed. Truth-of-record is the server.
 *
 * Everything lives here. It used to be spread over the reducer, three
 * render-time syncs, two `useState`s for the server's boards, and the
 * page's props read directly by the component, and the bugs sat in the
 * gaps: a refreshed bundle thrown away, a setup change nobody applied,
 * a limit that never re-seeded. One state, one merge, and the rules
 * about it are pure functions with tests (`matchScreenPlan.ts` for
 * what an event means, `matchScreenSelectors.ts` for what the screen
 * derives).
 *
 * Invariants that live HERE, behind the tested seam, not in the
 * component:
 *
 *   1. **Attempt privacy.** `upsert-log` carries the viewer and the
 *      reducer collapses any other player's raw attempt count via
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
  /** The Match row: name, place, scales, game mode, handicap. */
  match: Match;
  /** A custom ladder's labels; empty on a formula scale. */
  grades: MatchState["grades"];
  /** Routes on the wall. A withdrawn route is not one of them. */
  routes: MatchRoute[];
  players: MatchPlayerView[];
  /** Logs keyed by `${ownerId}:${route_id}` for O(1) upsert / remove. */
  logs: Map<string, MatchLog>;
  /**
   * Log keys with a write this device made that the server hasn't
   * confirmed: a tap on the wire, or one waiting in the offline queue.
   * A sync keeps these local copies and no others of the viewer's own
   * — see `syncFromServer`.
   */
  pending: Set<string>;
  /**
   * The server's points board, as `get_match_leaderboard` scored it.
   * Other players' rows come from here, because their logs reach this
   * device collapsed and cannot be scored on it (see `selectBoard`).
   */
  board: MatchLeaderboardRow[];
  /**
   * Chork's standings. Derived on the server and fetched: letters and
   * the pen both need every player's raw attempt count.
   */
  chork: ChorkView;
  /**
   * How many goes the open Chork round carries, for one route and
   * seat. Fetched when its sheet opens; read through `allowanceFor`,
   * so a value for another round is never shown.
   */
  allowance: { key: string; value: number | null } | null;
  panel: MatchPanel;
}

export interface ChorkView {
  /** Letters held, by seat. */
  letters: Map<string, number>;
  /** The seat that sets next. Null until the standings land. */
  penSeatId: string | null;
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
  | { type: "upsert-route"; route: MatchRoute }
  | { type: "remove-route"; id: string }
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
  /**
   * `pending` marks this device's own optimistic write; an upsert
   * without it (a realtime row, a rollback) is the server's word and
   * clears the key.
   */
  | { type: "upsert-log"; log: MatchLog; viewer: SeatViewer; pending?: boolean }
  /** The server accepted this device's write for (owner, route). */
  | { type: "settle-log"; ownerId: string; routeId: string }
  | { type: "remove-log"; userId: string; routeId: string }
  /**
   * A log deleted elsewhere, from its realtime DELETE, which carries
   * nothing but the row's id (checked 2026-09-15). `remove-log` stays
   * for the local rollback, which knows the owner and route.
   */
  | { type: "remove-log-by-id"; id: string }
  /**
   * A fresh bundle from the server, after a refresh. Realtime never
   * replays what it sent while this device's socket was down, so a
   * route put up while the phone was locked arrived nowhere: see
   * `syncFromServer` for how the two copies merge.
   */
  | { type: "sync"; bundle: MatchState }
  /** The Match row, from its own realtime UPDATE: a setup change. */
  | { type: "set-match"; match: Match }
  /** The server's board, refetched after someone else's log or a route. */
  | { type: "set-board"; rows: MatchLeaderboardRow[] }
  | { type: "set-chork"; standings: ChorkStanding[] }
  | { type: "set-allowance"; routeId: string; seatId?: string | null; value: number | null }
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
 * The key an allowance is stored and read under. A guest's round is
 * keyed by their seat; the viewer's own by "me".
 */
export function allowanceKey(routeId: string, seatId?: string | null): string {
  return `${routeId}:${seatId ?? "me"}`;
}

/** Initial reducer state from the server-rendered match payload.
 *  `my_logs` are the viewer's own rows — raw attempts stay. */
export function initMatchState(initialState: MatchState): MatchLocalState {
  return {
    match: initialState.match,
    grades: initialState.grades,
    board: initialState.leaderboard,
    chork: { letters: new Map(), penSeatId: null },
    allowance: null,
    pending: new Set(),
    // The bundle carries withdrawn routes, because the Chork pen reads
    // them server-side. To the room a withdrawn route is gone, the same
    // rule `upsert-route` applies live; without this one it came back
    // on every reload.
    routes: initialState.routes.filter((r) => r.withdrawn_at === null),
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

/**
 * Merge a fresh server bundle into live state.
 *
 * The Match row, its grades, the roster and the server's board are the
 * server's to say, so the bundle's replace what is here. A seat row
 * carries no name or face, which is why a join or a leave comes back
 * this way instead of being patched from its event.
 *
 * Routes: the server's list is the truth, so a route missed while the
 * socket was down arrives and a withdrawal missed with it leaves. The
 * one exception is a route numbered past everything in the bundle,
 * which was put up after the snapshot was read (this device's own
 * add, painted on server success, can land before a refresh started
 * earlier). Numbers only climb, and the bundle's own count includes
 * withdrawn routes, so its highest number is a true high-water mark.
 *
 * Logs: the server's copy wins, with two exceptions. A newer copy
 * already here (a realtime event that beat a slower refresh) stands.
 * And a log with a write still PENDING from this device — a tap on the
 * wire, or one in the offline queue — keeps its local copy, since a
 * snapshot taken before it would undo the tap on screen.
 *
 * The viewer's own logs used to keep their local copy unconditionally.
 * That undid the point of a sync when the screen itself started stale:
 * navigate back to a game inside the router cache's minute and the
 * mount's bundle predates your last send, so your tile stayed
 * "attempted" after the resync while the board said "sent". Pending,
 * not ownership, is what earns the local copy its place.
 */
function syncFromServer(state: MatchLocalState, bundle: MatchState): MatchLocalState {
  const server = initMatchState(bundle);
  const highWater = bundle.routes.reduce((max, r) => Math.max(max, r.number), 0);
  const routes = [
    ...server.routes,
    ...state.routes.filter((r) => r.number > highWater),
  ].sort((a, b) => a.number - b.number);

  const logs = new Map(server.logs);
  for (const [key, local] of state.logs) {
    const fromServer = logs.get(key);
    if (
      !fromServer ||
      state.pending.has(key) ||
      Date.parse(local.updated_at) > Date.parse(fromServer.updated_at)
    ) {
      logs.set(key, local);
    }
  }
  return {
    ...state,
    match: bundle.match,
    grades: bundle.grades,
    players: bundle.players,
    board: bundle.leaderboard,
    routes,
    logs,
  };
}

export function matchReducer(
  state: MatchLocalState,
  action: MatchAction,
): MatchLocalState {
  switch (action.type) {
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

    case "upsert-log": {
      // Privacy gate — see the module doc. The logs this viewer enters
      // keep raw attempts (the points preview, the log sheet and local
      // scoring need them): their own, and a guest's if they host.
      // Everyone else's collapse to the flash/completion buckets. This
      // compared `user_id` with the viewer's id, which is never true of
      // a guest log, so a host's guests were collapsed like strangers
      // and then scored on the host's phone from the collapsed count.
      const log = entersLogsFor(action.viewer, action.log)
        ? action.log
        : { ...action.log, attempts: visibleAttempts(action.log, false) };
      const key = logKey(ownerIdOf(log), log.route_id);
      const logs = new Map(state.logs);
      logs.set(key, log);
      const pending = new Set(state.pending);
      if (action.pending) pending.add(key);
      else pending.delete(key);
      return { ...state, logs, pending };
    }
    case "settle-log": {
      const key = logKey(action.ownerId, action.routeId);
      if (!state.pending.has(key)) return state;
      const pending = new Set(state.pending);
      pending.delete(key);
      return { ...state, pending };
    }
    case "remove-log": {
      const key = logKey(action.userId, action.routeId);
      const logs = new Map(state.logs);
      logs.delete(key);
      const pending = new Set(state.pending);
      pending.delete(key);
      return { ...state, logs, pending };
    }
    case "remove-log-by-id": {
      const entry = logEntryById(state.logs, action.id);
      if (!entry) return state;
      const logs = new Map(state.logs);
      logs.delete(entry[0]);
      return { ...state, logs };
    }
    case "sync":
      return syncFromServer(state, action.bundle);
    case "set-match":
      return { ...state, match: action.match };
    case "set-board":
      return { ...state, board: action.rows };
    case "set-chork":
      return {
        ...state,
        chork: {
          letters: new Map(action.standings.map((s) => [s.player_id, s.letters])),
          penSeatId: action.standings.find((s) => s.has_pen)?.player_id ?? null,
        },
      };
    case "set-allowance":
      return {
        ...state,
        allowance: {
          key: allowanceKey(action.routeId, action.seatId),
          value: action.value,
        },
      };
    case "open-panel":
      return { ...state, panel: action.panel };
    case "close-panel":
      return { ...state, panel: { kind: "none" } };
    default:
      return state;
  }
}
