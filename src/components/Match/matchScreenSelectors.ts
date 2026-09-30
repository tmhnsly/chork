import { ceilingForDiscipline, effectiveGrade } from "@/lib/data/grade-label";
import { computeMatchLeaderboard } from "@/lib/data/match-leaderboard";
import type {
  MatchLeaderboardRow,
  MatchLog,
  MatchPlayerView,
  MatchRoute,
} from "@/lib/data/match-types";
import { entersLogsFor, isGuestSeat, ownerIdOf, type SeatViewer } from "@/lib/data/seat";
import { allowanceKey, logKey, type MatchLocalState } from "./matchScreenReducer";

/**
 * What the live screen derives from its model. Pure, so each rule has
 * a test; the component reads these and renders.
 */

export function isChorkMatch(state: Pick<MatchLocalState, "match">): boolean {
  return state.match.game_mode === "chork";
}

/** The viewer's own seat, or null if they hold none. */
export function viewerSeat(state: MatchLocalState, viewer: SeatViewer): MatchPlayerView | null {
  return state.players.find((p) => p.user_id === viewer.userId) ?? null;
}

/** The viewer's own logs by route: tile state and the log sheet's pre-fill. */
export function viewerLogs(state: MatchLocalState, viewer: SeatViewer): Map<string, MatchLog> {
  const byRoute = new Map<string, MatchLog>();
  for (const log of state.logs.values()) {
    if (log.user_id === viewer.userId) byRoute.set(log.route_id, log);
  }
  return byRoute;
}

/**
 * The points board.
 *
 * The seats this viewer enters for are scored here from raw logs, so a
 * tap shows at once. Everyone else's rows come from the server's board
 * (`state.board`): their logs reach this device collapsed to the public
 * buckets, where every non-flash send reads as a second go. Found at
 * Yonder, when other players' scores were wrong for exactly those.
 *
 * Handicap: a log knows its route, not its grade or discipline, so
 * both are resolved here. A ceiling only means something against the
 * ladder it was given on, so each route is measured against the limit
 * for ITS discipline family (migration 121).
 */
export function selectBoard(state: MatchLocalState, viewer: SeatViewer): MatchLeaderboardRow[] {
  const routeById = new Map(state.routes.map((r) => [r.id, r]));
  return computeMatchLeaderboard(state.players, state.logs, {
    handicap: state.match.handicap,
    gradeByRouteId: new Map(state.routes.map((r) => [r.id, effectiveGrade(r)])),
    ceilingForRoute: (player, routeId) =>
      ceilingForDiscipline(state.match, player, routeById.get(routeId)?.discipline ?? null),
    // Chork has no points board for the server to supply.
    serverRows: isChorkMatch(state) ? undefined : state.board,
    scoredHere: (player) => entersLogsFor(viewer, player),
  });
}

/** Chork: the seat holding the pen, once the standings have landed. */
export function penHolder(state: MatchLocalState): MatchPlayerView | null {
  if (!isChorkMatch(state) || state.chork.penSeatId === null) return null;
  return state.players.find((p) => p.player_id === state.chork.penSeatId) ?? null;
}

/**
 * Who may put up the next route. Points: anyone. Chork: whoever holds
 * the pen, or the host when the pen sits with a guest, who has no
 * session to tap with.
 *
 * An unknown pen (the standings haven't landed, or the fetch failed)
 * degrades to open rather than shut: locking the button on "don't know
 * yet" would leave a whole game unable to start over one bad response.
 */
export function canSetRoute(state: MatchLocalState, viewer: SeatViewer): boolean {
  if (!isChorkMatch(state)) return true;
  const holder = penHolder(state);
  return holder === null || entersLogsFor(viewer, holder);
}

/** The open log sheet: which route, for which seat, and that seat's log. */
export interface OpenLog {
  route: MatchRoute;
  /** The seat being logged for. Null if the viewer holds no seat. */
  seat: MatchPlayerView | null;
  /**
   * The seat's id when the host is entering for a guest, else null:
   * the form every write for "a seat that isn't the caller's own"
   * takes (`p_player_id`).
   */
  guestSeatId: string | null;
  log: MatchLog | null;
  /** Whichever of the seat's two limits this route is measured against. */
  ceiling: number | null;
  /** Chork: the goes this round carries, once fetched for this route and seat. */
  allowance: number | null;
}

/**
 * The log panel's context, or null when it isn't open or its route has
 * gone. Panels store ids and resolve them here, so a route edited or
 * deleted by realtime never renders from a captured snapshot.
 *
 * The log belongs to the SEAT being logged for, not to the viewer:
 * passing the viewer's own meant a host opening a guest's round saw
 * their own goes and send on it.
 */
export function openLog(state: MatchLocalState, viewer: SeatViewer): OpenLog | null {
  const { panel } = state;
  if (panel.kind !== "log") return null;
  const route = state.routes.find((r) => r.id === panel.routeId);
  if (!route) return null;
  const seat = panel.playerId
    ? state.players.find((p) => p.player_id === panel.playerId) ?? null
    : viewerSeat(state, viewer);
  const guestSeatId = seat && isGuestSeat(seat) ? seat.player_id : null;
  const stored = state.allowance;
  return {
    route,
    seat,
    guestSeatId,
    log: seat ? state.logs.get(logKey(ownerIdOf(seat), route.id)) ?? null : null,
    ceiling: seat ? ceilingForDiscipline(state.match, seat, route.discipline) : null,
    // Only a value fetched for THIS round and seat. A fast switch
    // between routes would otherwise show the last one's for a frame.
    allowance: stored?.key === allowanceKey(route.id, guestSeatId) ? stored.value : null,
  };
}

/** The route the edit sheet is open on. */
export function routeBeingEdited(state: MatchLocalState): MatchRoute | null {
  const { panel } = state;
  return panel.kind === "edit" ? state.routes.find((r) => r.id === panel.routeId) ?? null : null;
}

/**
 * The seat a peek or limit sheet is open on. Matched on the seat's one
 * id: the board opens a peek with `ownerIdOf(row)`, a guest's seat id,
 * and a lookup by `user_id` would never find a guest.
 */
export function seatInPanel(
  state: MatchLocalState,
  kind: "peek" | "ceiling",
): MatchPlayerView | null {
  const { panel } = state;
  if (panel.kind !== kind) return null;
  return (
    state.players.find((p) =>
      kind === "peek" ? ownerIdOf(p) === panel.playerId : p.player_id === panel.playerId,
    ) ?? null
  );
}
