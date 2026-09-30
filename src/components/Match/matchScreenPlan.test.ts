import { describe, expect, it } from "vitest";
import type { MatchEvent, MatchRealtimeEvent } from "@/hooks/use-match-realtime";
import type { Match } from "@/lib/data/match-types";
import { mkBundle, mkGuest, mkGuestLog, mkLog, mkMatch, mkPlayer, mkRoute } from "@/test/match-fixtures";
import { initMatchState, logKey, type MatchLocalState } from "./matchScreenReducer";
import { planEvent, scoringEffects } from "./matchScreenPlan";

/**
 * What an event means for the live screen. Every case here was once a
 * line in a realtime callback that no test could reach, and most of
 * them were wrong or missing at some point:
 *
 *   - a resumed feed refreshed nothing, so a route put up while a phone
 *     was locked never arrived
 *   - the Match row's UPDATE was only read for "ended", so a setup
 *     change reached nobody
 *   - a deleted seat refreshed a game that was being deleted
 *   - a new route in Chork left the pen with the previous setter until
 *     somebody logged something
 */

const me = { userId: "u1", isHost: false };
const host = { userId: "u1", isHost: true };

function stateOf(overrides: Parameters<typeof mkBundle>[0] = {}): MatchLocalState {
  return initMatchState(mkBundle(overrides));
}
const points = (overrides: Parameters<typeof mkBundle>[0] = {}) => stateOf(overrides);
const chork = (overrides: Parameters<typeof mkBundle>[0] = {}) =>
  stateOf({ match: mkMatch({ game_mode: "chork" }), ...overrides });

const inserted = <T,>(row: T): MatchRealtimeEvent<T> => ({ eventType: "INSERT", new: row, old: {} });
const updated = <T,>(row: T): MatchRealtimeEvent<T> => ({ eventType: "UPDATE", new: row, old: {} });
const deleted = <T,>(id: string): MatchRealtimeEvent<T> => ({ eventType: "DELETE", new: {}, old: { id } });

const kinds = (plan: { effects: Array<{ kind: string }> }) => plan.effects.map((e) => e.kind);

describe("planEvent — a route", () => {
  it("puts a new or edited route on the wall", () => {
    const route = mkRoute("a", 1);
    const plan = planEvent(points(), me, { kind: "route", evt: inserted(route) });
    expect(plan.actions).toEqual([{ type: "upsert-route", route }]);
  });

  it("takes a deleted route off by its id, which is all a DELETE carries", () => {
    const plan = planEvent(points({ routes: [mkRoute("a", 1)] }), me, {
      kind: "route",
      evt: deleted("a"),
    });
    expect(plan.actions).toEqual([{ type: "remove-route", id: "a" }]);
  });

  it("asks for the board again in a points game: a regrade or withdrawal moves points", () => {
    const plan = planEvent(points(), me, { kind: "route", evt: updated(mkRoute("a", 1)) });
    expect(kinds(plan)).toEqual(["refetch-board"]);
  });

  it("asks for the standings again in Chork: a route is a round, and moves the pen", () => {
    const plan = planEvent(chork(), me, { kind: "route", evt: inserted(mkRoute("a", 1)) });
    expect(kinds(plan)).toEqual(["refetch-chork"]);
  });
});

describe("planEvent — a log", () => {
  it("upserts with the viewer, so the reducer's privacy gate applies", () => {
    const log = mkLog("u2", "a", { attempts: 5 });
    const plan = planEvent(points(), me, { kind: "log", evt: inserted(log) });
    expect(plan.actions).toEqual([{ type: "upsert-log", log, viewer: me }]);
  });

  it("refetches the board for someone else's log, which can't be scored here", () => {
    const plan = planEvent(points(), me, { kind: "log", evt: inserted(mkLog("u2", "a")) });
    expect(kinds(plan)).toEqual(["refetch-board"]);
  });

  it("refetches nothing for the viewer's own log: it is scored here already", () => {
    const plan = planEvent(points(), me, { kind: "log", evt: updated(mkLog("u1", "a")) });
    expect(plan.effects).toEqual([]);
  });

  it("scores a guest's log here for the host, and from the server for everyone else", () => {
    const evt = inserted(mkGuestLog("seat-9", "a"));
    expect(planEvent(points(), host, { kind: "log", evt }).effects).toEqual([]);
    expect(kinds(planEvent(points(), me, { kind: "log", evt }))).toEqual(["refetch-board"]);
  });

  it("finds a deleted log's owner in the model, since the event carries only its id", () => {
    const own = mkLog("u1", "a");
    const theirs = mkLog("u2", "a");
    const state = {
      ...points(),
      logs: new Map([
        [logKey("u1", "a"), own],
        [logKey("u2", "a"), theirs],
      ]),
    };
    const mine = planEvent(state, me, { kind: "log", evt: deleted(own.id) });
    expect(mine.actions).toEqual([{ type: "remove-log-by-id", id: own.id }]);
    expect(mine.effects).toEqual([]);
    expect(kinds(planEvent(state, me, { kind: "log", evt: deleted(theirs.id) }))).toEqual([
      "refetch-board",
    ]);
  });

  it("refetches for a deleted log this screen never held: the safe default", () => {
    const plan = planEvent(points(), me, { kind: "log", evt: deleted("unknown") });
    expect(kinds(plan)).toEqual(["refetch-board"]);
  });

  it("asks for the standings on anyone's log in Chork, the viewer's own included", () => {
    expect(kinds(planEvent(chork(), me, { kind: "log", evt: inserted(mkLog("u1", "a")) }))).toEqual([
      "refetch-chork",
    ]);
    expect(kinds(planEvent(chork(), me, { kind: "log", evt: inserted(mkLog("u2", "a")) }))).toEqual([
      "refetch-chork",
    ]);
  });
});

describe("planEvent — a seat", () => {
  const seated = () => points({ players: [mkPlayer("u1", "alice"), mkPlayer("u2", "bob")] });
  const seatEvent = (evt: MatchRealtimeEvent<{ id: string }>): MatchEvent => ({ kind: "seat", evt });

  it("refreshes for a join: a seat row has no name or face, the server has them", () => {
    const plan = planEvent(seated(), me, seatEvent(inserted({ id: "u3" })));
    expect(plan.actions).toEqual([]);
    expect(kinds(plan)).toEqual(["refresh"]);
  });

  it("refreshes for a leave, even the viewer's own: leaving parks the seat, it isn't deleted", () => {
    expect(kinds(planEvent(seated(), me, seatEvent(updated({ id: "u1" }))))).toEqual(["refresh"]);
  });

  it("reads the viewer's own seat being deleted as the game going", () => {
    const plan = planEvent(seated(), me, seatEvent(deleted("u1")));
    expect(plan.actions).toEqual([]);
    expect(kinds(plan)).toEqual(["deleted"]);
  });

  it("takes anyone else's deleted seat off by its id, and never refreshes", () => {
    // A refresh here re-rendered a game that was being deleted, bounced
    // the viewer to the join screen, and queued a router action for the
    // screen's own navigation to lose.
    const plan = planEvent(seated(), me, seatEvent(deleted("u2")));
    expect(plan.actions).toEqual([{ type: "remove-player", playerId: "u2" }]);
    expect(plan.effects).toEqual([]);
  });

  it("never reads the game as deleted while the viewer holds no seat", () => {
    const plan = planEvent(points({ players: [mkPlayer("u2", "bob")] }), me, seatEvent(deleted("u2")));
    expect(kinds(plan)).toEqual([]);
  });
});

describe("planEvent — the Match row", () => {
  const live = mkMatch();
  const withRoute = () => points({ match: live, routes: [mkRoute("a", 1)] });
  const matchEvent = (row: Match): MatchEvent => ({ kind: "match", evt: updated(row) });

  it("leaves for the result when the host ends the game", () => {
    const plan = planEvent(withRoute(), me, matchEvent({ ...live, status: "archived" }));
    expect(plan.actions).toEqual([]);
    expect(kinds(plan)).toEqual(["ended"]);
  });

  it("ignores the activity bump every route and log makes", () => {
    // A trigger stamps `last_activity_at` on each of them, so the row's
    // UPDATE fires for every tap in the room.
    const plan = planEvent(withRoute(), me, matchEvent({ ...live, last_activity_at: "2026-04-01T09:05:00Z" }));
    expect(plan).toEqual({ actions: [], effects: [] });
  });

  it.each([
    ["name", "Friday session"],
    ["location", "The Arch"],
    ["grading_scale", "font"],
    ["max_grade", 12],
    ["alt_grading_scale", "yds"],
    ["game_mode", "chork"],
    ["handicap", true],
  ] as const)("paints a changed %s at once, then refreshes", (field, value) => {
    const row = { ...live, [field]: value };
    const plan = planEvent(withRoute(), me, matchEvent(row));
    expect(plan.actions).toEqual([{ type: "set-match", match: row }]);
    expect(kinds(plan)).toEqual(["refresh"]);
  });

  it("refreshes on any change before the first route: a custom ladder shows in no field of the row", () => {
    const row = { ...live, last_activity_at: "2026-04-01T09:05:00Z" };
    const plan = planEvent(points({ match: live }), me, matchEvent(row));
    expect(plan.actions).toEqual([{ type: "set-match", match: row }]);
    expect(kinds(plan)).toEqual(["refresh"]);
  });

  it("does nothing for an event that isn't an update", () => {
    expect(planEvent(withRoute(), me, { kind: "match", evt: inserted(live) })).toEqual({
      actions: [],
      effects: [],
    });
  });
});

describe("planEvent — the feed resuming", () => {
  it("refreshes, because realtime replays nothing it sent while the socket was down", () => {
    const plan = planEvent(points(), me, { kind: "resume" });
    expect(plan.actions).toEqual([]);
    expect(kinds(plan)).toEqual(["refresh"]);
  });

  it("also asks for Chork's standings, which no bundle carries", () => {
    expect(kinds(planEvent(chork(), me, { kind: "resume" }))).toEqual(["refresh", "refetch-chork"]);
  });
});

describe("scoringEffects", () => {
  it("is the board in a points game and the standings in Chork", () => {
    expect(scoringEffects(mkMatch())).toEqual([{ kind: "refetch-board" }]);
    expect(scoringEffects(mkMatch({ game_mode: "chork" }))).toEqual([{ kind: "refetch-chork" }]);
  });
});

// A guest seat never satisfies "the viewer's own seat", host or not.
describe("planEvent — a guest's seat", () => {
  it("is removed like anyone else's when deleted, even for the host who entered for it", () => {
    const state = points({ players: [mkPlayer("u1", "alice"), mkGuest("seat-9", "Dave")] });
    const plan = planEvent(state, host, { kind: "seat", evt: deleted("seat-9") });
    expect(plan.actions).toEqual([{ type: "remove-player", playerId: "seat-9" }]);
  });
});
