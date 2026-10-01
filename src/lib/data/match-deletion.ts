import { countOf } from "@/lib/plural";

/** A seat, as much as the delete confirmation needs of it. */
export interface DeletionSeat {
  user_id: string | null;
  username: string | null;
  is_guest: boolean;
}

const TAIL = "with every route and send in it. This can't be undone.";

/**
 * The delete confirmation, naming who else loses the game.
 *
 * Up to two account holders by @username, then a count of everyone
 * else, guests included. The verb agrees with how many people that is.
 */
export function deleteGameWarning(seats: DeletionSeat[], viewerId: string): string {
  const others = seats.filter((s) => s.user_id !== viewerId);
  if (others.length === 0) {
    return "Delete this game? Every route and send in it goes. This can't be undone.";
  }
  const verb = others.length === 1 ? "loses" : "lose";
  return `Delete this game for everyone? ${whoElse(others)} ${verb} it, ${TAIL}`;
}

function whoElse(others: DeletionSeat[]): string {
  const named = others
    .filter((s) => !s.is_guest && s.username)
    .slice(0, 2)
    .map((s) => `@${s.username}`);
  const rest = others.length - named.length;
  if (named.length === 0) return rest === 1 ? "A guest" : countOf(rest, "guest");
  if (rest === 0) return named.join(" and ");
  return `${named.join(", ")} and ${countOf(rest, "other")}`;
}

/** The facts `delete_match` decides on. */
export interface DeletableGame {
  hostId: string;
}

/**
 * Whether to offer Delete game. Mirrors `delete_match`, which is the
 * real gate: the host, live or finished.
 */
export function canDeleteGame(game: DeletableGame, viewerId: string): boolean {
  return game.hostId === viewerId;
}

/** What a game's options sheet offers the viewer. */
export interface GameOptions {
  /** Take a finished game off your games, or put a hidden one back. */
  hide: "remove" | "put-back" | null;
  /** Delete game, for everyone (`canDeleteGame`). */
  delete: boolean;
}

/**
 * The options sheet's items, or null when it has none to offer. Only a
 * finished game can be taken off your games (`set_match_hidden` refuses
 * a live one).
 */
export function gameOptions(game: {
  finished: boolean;
  hidden: boolean;
  canDelete: boolean;
}): GameOptions | null {
  const options: GameOptions = {
    hide: game.hidden ? "put-back" : game.finished ? "remove" : null,
    delete: game.canDelete,
  };
  return options.hide !== null || options.delete ? options : null;
}
