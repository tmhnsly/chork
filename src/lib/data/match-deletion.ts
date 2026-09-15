import { countOf } from "@/lib/plural";
import type { MatchStatus } from "./match-types";

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
  leagueId: string | null;
  status: MatchStatus;
  routeCount: number;
}

/**
 * Whether to offer Delete game. Mirrors `delete_match` (migration 141),
 * which is the real gate: the host only, and a league week only while it
 * is live with no routes, the accidental one-tap start.
 */
export function canDeleteGame(game: DeletableGame, viewerId: string): boolean {
  if (game.hostId !== viewerId) return false;
  if (game.leagueId === null) return true;
  return game.status === "live" && game.routeCount === 0;
}
