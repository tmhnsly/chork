import { describe, expect, it } from "vitest";
import { canDeleteGame, deleteGameWarning, gameOptions, type DeletionSeat } from "./match-deletion";

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
  const game = { hostId: HOST };

  it("lets the host delete their game, live or finished", () => {
    expect(canDeleteGame(game, HOST)).toBe(true);
  });

  it("never offers it to anyone else", () => {
    expect(canDeleteGame(game, "someone-else")).toBe(false);
  });
});

describe("gameOptions", () => {
  const player = { finished: true, hidden: false, canDelete: false };

  it("lets a player take a finished game off their games, or put a hidden one back", () => {
    expect(gameOptions(player)).toEqual({ hide: "remove", delete: false });
    expect(gameOptions({ ...player, hidden: true })).toEqual({ hide: "put-back", delete: false });
  });

  it("never offers to remove a live game, which set_match_hidden always refuses", () => {
    expect(gameOptions({ ...player, finished: false, canDelete: true })).toEqual({ hide: null, delete: true });
  });

  it("offers a player on a live game nothing at all", () => {
    expect(gameOptions({ ...player, finished: false })).toBeNull();
  });
});
