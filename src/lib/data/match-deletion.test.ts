import { describe, expect, it } from "vitest";
import { canDeleteGame, deleteGameWarning, type DeletionSeat } from "./match-deletion";

const HOST = "host-id";
const host: DeletionSeat = { user_id: HOST, username: "tom", is_guest: false };
const guest: DeletionSeat = { user_id: null, username: null, is_guest: true };
const climber = (username: string): DeletionSeat => ({
  user_id: `${username}-id`,
  username,
  is_guest: false,
});
const TAIL = "with every route and send in it. This can't be undone.";

describe("deleteGameWarning", () => {
  it("tells a host playing alone that everything goes", () => {
    expect(deleteGameWarning([host], HOST)).toBe(
      "Delete this game? Every route and send in it goes. This can't be undone.",
    );
  });

  it("names one other player with a verb that agrees", () => {
    expect(deleteGameWarning([host, climber("elmo")], HOST)).toBe(
      `Delete this game for everyone? @elmo loses it, ${TAIL}`,
    );
  });

  it("names two players", () => {
    expect(deleteGameWarning([host, climber("elmo"), climber("sam")], HOST)).toBe(
      `Delete this game for everyone? @elmo and @sam lose it, ${TAIL}`,
    );
  });

  it("names two and counts everyone else, guests included", () => {
    expect(
      deleteGameWarning([host, climber("elmo"), climber("sam"), climber("kit"), guest], HOST),
    ).toBe(`Delete this game for everyone? @elmo, @sam and 2 others lose it, ${TAIL}`);
  });

  it("counts a single other after one name", () => {
    expect(deleteGameWarning([host, climber("elmo"), guest], HOST)).toBe(
      `Delete this game for everyone? @elmo and 1 other lose it, ${TAIL}`,
    );
  });

  it("says a guest when guests are all there is", () => {
    expect(deleteGameWarning([host, guest], HOST)).toBe(
      `Delete this game for everyone? A guest loses it, ${TAIL}`,
    );
    expect(deleteGameWarning([host, guest, guest], HOST)).toBe(
      `Delete this game for everyone? 2 guests lose it, ${TAIL}`,
    );
  });
});

describe("canDeleteGame", () => {
  const game = { hostId: HOST, leagueId: null, status: "live" as const, routeCount: 3 };

  it("lets the host delete a game outside a league, live or finished", () => {
    expect(canDeleteGame(game, HOST)).toBe(true);
    expect(canDeleteGame({ ...game, status: "archived" }, HOST)).toBe(true);
  });

  it("never offers it to anyone else", () => {
    expect(canDeleteGame(game, "someone-else")).toBe(false);
  });

  it("offers it on a league week only while the week is live with no routes", () => {
    const week = { ...game, leagueId: "league-1" };
    expect(canDeleteGame({ ...week, routeCount: 0 }, HOST)).toBe(true);
    expect(canDeleteGame(week, HOST)).toBe(false);
    expect(canDeleteGame({ ...week, status: "archived", routeCount: 0 }, HOST)).toBe(false);
  });
});
