import type {
  Match,
  MatchLog,
  MatchPlayerView,
  MatchRoute,
  MatchState,
} from "@/lib/data/match-types";

/**
 * Fixtures for the live Match screen's model, plan and selectors.
 * Seat ids mirror account ids, so an assertion keyed on one keeps
 * meaning the same thing as the other.
 */

export function mkMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    code: "ABC123",
    name: "Tom's game",
    location: null,
    host_id: "host",
    handicap: false,
    game_mode: "points",
    grading_scale: "v",
    min_grade: 0,
    max_grade: 10,
    discipline: "boulder",
    alt_grading_scale: null,
    alt_min_grade: null,
    alt_max_grade: null,
    status: "live",
    starts_at: "2026-04-01T09:00:00Z",
    ends_at: null,
    last_activity_at: "2026-04-01T09:00:00Z",
    league_id: null,
    ...overrides,
  };
}

export function mkRoute(id: string, number: number, overrides: Partial<MatchRoute> = {}): MatchRoute {
  return {
    id,
    set_id: "match-1",
    number,
    description: null,
    declared_grade: null,
    community_grade: null,
    discipline: null,
    has_zone: false,
    added_by: null,
    added_by_player: null,
    withdrawn_at: null,
    created_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

export function mkPlayer(
  user_id: string,
  username: string,
  overrides: Partial<MatchPlayerView> = {},
): MatchPlayerView {
  return {
    player_id: user_id,
    user_id,
    is_guest: false,
    ceiling: null,
    alt_ceiling: null,
    username,
    display_name: username,
    avatar_url: null,
    joined_at: "2026-04-01T00:00:00Z",
    is_host: false,
    has_left: false,
    ...overrides,
  };
}

/** A guest: a named seat with no account behind it. */
export function mkGuest(seatId: string, name: string): MatchPlayerView {
  return mkPlayer(seatId, name, {
    user_id: null,
    is_guest: true,
    username: null,
    display_name: name,
  });
}

export function mkLog(user_id: string, route_id: string, overrides: Partial<MatchLog> = {}): MatchLog {
  return {
    id: `${user_id}-${route_id}`,
    set_id: "match-1",
    route_id,
    user_id,
    player_id: null,
    attempts: 1,
    completed: true,
    completed_at: "2026-04-01T10:00:00Z",
    zone: false,
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
    ...overrides,
  };
}

/** A guest's log: owned by the seat, no account. */
export function mkGuestLog(seatId: string, route_id: string, overrides: Partial<MatchLog> = {}): MatchLog {
  return { ...mkLog(seatId, route_id, overrides), user_id: null, player_id: seatId };
}

/** What `get_match_state_for_user` returns, empty unless told otherwise. */
export function mkBundle(overrides: Partial<MatchState> = {}): MatchState {
  return {
    match: mkMatch(),
    grades: [],
    routes: [],
    players: [],
    my_logs: [],
    guest_logs: [],
    other_logs: [],
    leaderboard: [],
    ...overrides,
  };
}
