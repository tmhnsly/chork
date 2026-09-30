import type { MatchEvent } from "@/hooks/use-match-realtime";
import type { Match } from "@/lib/data/match-types";
import { entersLogsFor, type SeatViewer } from "@/lib/data/seat";
import {
  isLobby,
  logEntryById,
  type MatchAction,
  type MatchLocalState,
} from "./matchScreenReducer";

/**
 * What an event from the room means for the live screen.
 *
 * `planEvent` is a pure decision: given the model, who is looking and
 * something that happened, it returns the actions to apply to the
 * model and the effects to run after (a refetch, a refresh, leaving).
 * The hook applies one and runs the other; it decides nothing.
 *
 * This is where the screen's bugs lived. Each was a missing or wrong
 * line in a realtime callback that no test could reach: a resumed feed
 * that refreshed nothing, a setup change only read for "ended", a
 * deleted seat that refreshed a game being deleted. Here every one of
 * those is a case in `matchScreenPlan.test.ts`.
 */

export type MatchEffect =
  /** Ask the server for the points board again (other players' scores). */
  | { kind: "refetch-board" }
  /** Ask the server for Chork's standings again. */
  | { kind: "refetch-chork" }
  /** Re-render the page for a fresh bundle, which `sync` then merges. */
  | { kind: "refresh" }
  /** The host ended the game: go to its result. */
  | { kind: "ended" }
  /** The game was deleted under this screen: leave, and do nothing else. */
  | { kind: "deleted" };

export interface MatchPlan {
  actions: MatchAction[];
  effects: MatchEffect[];
}

const NOTHING: MatchPlan = { actions: [], effects: [] };

/**
 * The Match row's fields that the host can change during a game.
 * `last_activity_at` is not one: a trigger bumps it on every route and
 * log, so the row's UPDATE fires far more often than its setup changes.
 */
const SETUP_FIELDS = [
  "name",
  "location",
  "discipline",
  "grading_scale",
  "min_grade",
  "max_grade",
  "alt_grading_scale",
  "alt_min_grade",
  "alt_max_grade",
  "game_mode",
  "handicap",
] as const satisfies ReadonlyArray<keyof Match>;

function setupChanged(shown: Match, row: Match): boolean {
  return SETUP_FIELDS.some((field) => shown[field] !== row[field]);
}

/**
 * What a change that can move scores asks of the server. Chork has no
 * points board, and its standings are derived from attempts this
 * device cannot see. Shared with the hook's own writes, so putting a
 * route up locally asks for the same thing its echo would.
 */
export function scoringEffects(match: Pick<Match, "game_mode">): MatchEffect[] {
  return [{ kind: match.game_mode === "chork" ? "refetch-chork" : "refetch-board" }];
}

export function planEvent(
  state: MatchLocalState,
  viewer: SeatViewer,
  event: MatchEvent,
): MatchPlan {
  switch (event.kind) {
    case "route": {
      const { evt } = event;
      return {
        actions: [
          evt.eventType === "DELETE"
            ? { type: "remove-route", id: evt.old.id }
            : { type: "upsert-route", route: evt.new },
        ],
        // A route is a round in Chork, so one going up moves the pen; in
        // a points game a route withdrawn or regraded moves points.
        effects: scoringEffects(state.match),
      };
    }

    case "log": {
      const { evt } = event;
      // A DELETE carries only the log's id (checked 2026-09-15), so its
      // owner is read from the model, before the action removes it.
      const log = evt.eventType === "DELETE" ? logEntryById(state.logs, evt.old.id)?.[1] : evt.new;
      const action: MatchAction =
        evt.eventType === "DELETE"
          ? { type: "remove-log-by-id", id: evt.old.id }
          : { type: "upsert-log", log: evt.new, viewer };
      if (state.match.game_mode === "chork") {
        // Anyone's log can change who owes a letter.
        return { actions: [action], effects: [{ kind: "refetch-chork" }] };
      }
      // The seats this viewer enters for are scored here, from the log
      // just applied. Anyone else's needs the server's scoring, and so
      // does a log this screen never held: the safe default.
      const scoredHere = log !== undefined && entersLogsFor(viewer, log);
      return { actions: [action], effects: scoredHere ? [] : [{ kind: "refetch-board" }] };
    }

    case "seat": {
      const { evt } = event;
      // A join or a leave. Leaving parks the seat with `left_at`, so it
      // is an UPDATE. The server has the names; ask it.
      if (evt.eventType !== "DELETE") return { actions: [], effects: [{ kind: "refresh" }] };
      // A seat row is deleted only with its game or its account, so the
      // viewer's own going means the game went. Never a refresh on a
      // DELETE: that re-rendered a game being deleted, bounced the
      // viewer to the join screen, and left a router action queued for
      // the screen's own navigation to Games to lose.
      const own = state.players.find((p) => p.user_id === viewer.userId)?.player_id ?? null;
      if (own !== null && evt.old.id === own) return { actions: [], effects: [{ kind: "deleted" }] };
      return { actions: [{ type: "remove-player", playerId: evt.old.id }], effects: [] };
    }

    case "match": {
      const { evt } = event;
      if (evt.eventType !== "UPDATE") return NOTHING;
      // The host ended it. Everyone else is looking at a board that has
      // silently stopped accepting writes.
      if (evt.new.status === "archived") return { actions: [], effects: [{ kind: "ended" }] };
      // The host changed the setup. Painted at once from the row, then
      // refreshed: a custom ladder lives in `set_grades`, where no field
      // of this row shows it, and the board is rescored by the server.
      // Until the first route nothing else touches the row, so any
      // change then counts.
      if (isLobby(state) || setupChanged(state.match, evt.new)) {
        return {
          actions: [{ type: "set-match", match: evt.new }],
          effects: [{ kind: "refresh" }],
        };
      }
      return NOTHING;
    }

    case "resume":
      // Routes, logs, seats, the setup and the board come back with a
      // fresh bundle. Chork's standings are not in it.
      return {
        actions: [],
        effects:
          state.match.game_mode === "chork"
            ? [{ kind: "refresh" }, { kind: "refetch-chork" }]
            : [{ kind: "refresh" }],
      };
  }
}
