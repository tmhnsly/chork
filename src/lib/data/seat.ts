/**
 * THE home of seat presentation — who a row is, and what we call and
 * draw them.
 *
 * CONTEXT.md ("Guest players"): identity is the SEAT, the one thing
 * both kinds of player have. An account-backed seat resolves to its
 * `user_id`, a guest's to its `player_id`; a gym-board row is the
 * degenerate case with only an account. Before this module the id
 * rule had `ownerIdOf` but naming and avatar-shaping were re-decided
 * at every surface — six display-name ladders and eight inline
 * avatar shapes, including two contradictory answers 44 lines apart
 * on the match summary (a guest's avatar got their seat id on the
 * Chork board and an empty string on the points board).
 *
 * Three functions, one rule each:
 *   `ownerIdOf`      — the seat's one string id.
 *   `seatName`       — what the row is called. Display name wins
 *                      (trimmed — whitespace is not a name), then
 *                      username, then "Guest" for a guest seat,
 *                      then the surface's fallback ("Climber").
 *   `seatAvatarUser` — the `<UserAvatar>` shape. The avatar's `name`
 *                      falls back through display name → profile
 *                      name → username so the glyph always has an
 *                      initial to draw.
 *
 * Pure and structural: every field optional/nullable so all five row
 * shapes (MatchPlayerView, MatchLeaderboardRow, ChorkStanding,
 * LeagueStanding, LeaderboardEntry, shared-result players) fit
 * without adapters.
 */

export interface SeatLike {
  user_id?: string | null;
  player_id?: string | null;
  username?: string | null;
  /** Match-side rows: profile name, or the seat's own for a guest. */
  display_name?: string | null;
  /** Gym-side rows (`LeaderboardEntry`) carry the profile name here. */
  name?: string | null;
  avatar_url?: string | null;
  is_guest?: boolean;
}

/**
 * The one string that identifies who a log or seat belongs to: an
 * account's `user_id`, or a guest's seat id. A row always has one or
 * the other — `route_logs_owner_ck` and `set_players_identity_ck`
 * both enforce exactly-one.
 */
export function ownerIdOf(
  owner: { user_id: string | null; player_id?: string | null },
): string {
  return owner.user_id ?? owner.player_id ?? "";
}

/** A guest seat: says so, or has no account behind it. */
export function isGuestSeat(seat: SeatLike): boolean {
  return seat.is_guest ?? seat.user_id == null;
}

/**
 * What to call this seat, one rule for every surface. The fallback
 * is for an account row whose profile join came back empty (deleted
 * account) — pass the surface's own word ("this climber", "Admin",
 * "Unknown climber") where "Climber" reads wrong.
 */
export function seatName(
  seat: SeatLike,
  opts: { fallback?: string } = {},
): string {
  const display = seat.display_name?.trim() || seat.name?.trim();
  if (display) return display;
  if (seat.username) return seat.username;
  if (isGuestSeat(seat)) return "Guest";
  return opts.fallback ?? "Climber";
}

/**
 * The `<UserAvatar user={…}>` shape from any seat-like row. The id is
 * the seat's — a guest's avatar is keyed by their seat everywhere,
 * never an empty string.
 */
export function seatAvatarUser(seat: SeatLike): {
  id: string;
  username: string;
  name: string;
  avatar_url: string;
} {
  return {
    id: ownerIdOf({
      user_id: seat.user_id ?? null,
      player_id: seat.player_id ?? null,
    }),
    username: seat.username ?? "unknown",
    // Falls back to the handle so the glyph always has an initial to
    // draw, matching the visible name beside it.
    name: seat.display_name ?? seat.name ?? seat.username ?? "",
    avatar_url: seat.avatar_url ?? "",
  };
}
