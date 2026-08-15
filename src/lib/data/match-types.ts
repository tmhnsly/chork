// Match domain types.
//
// A **Match** is a climber-run Set: same container as a gym Set, at
// different settings. See CONTEXT.md. Since the convergence
// (migrations 080–086) these shapes describe rows in `sets` /
// `routes` / `route_logs` / `set_players`, not the retired `match_*`
// mirror.
//
// The file is still named `match-types.ts` and still exports `Match*`
// names on purpose: renaming the code is its own pass, done once the
// `match_*` TABLES are dropped, so that this change is a pure
// data-source swap and reviewable as one. See docs/roadmap.md.
//
// Keeping the shapes here rather than importing
// `Database["public"]["Tables"]` at every call site means generated-
// type drift surfaces as compile errors in one file.

import type { Discipline, GradingScaleWithCustom } from "./grade-label";

// The scale union lives in grade-label.ts (the single source of truth
// for grade → label resolution); this alias keeps Match call sites on
// their domain-local name.
export type MatchGradingScale = GradingScaleWithCustom;

/**
 * A Match's lifecycle, in the vocabulary the UI speaks.
 *
 * The column underneath is `sets.status`, whose domain is
 * `draft | live | archived` across both kinds of Set — `archived`
 * means "finished" for a Match. Deliberately not a separate `ended`
 * value: two words for one state is how the legacy `active`/`status`
 * split started (see migration 080).
 */
export type MatchStatus = "live" | "archived";

/** A Match — the `sets` row, narrowed to `owner_kind = 'climber'`. */
export interface Match {
  /** Score relative to each player's ceiling. Matches only. */
  handicap: boolean;
  id: string;
  code: string;
  name: string | null;
  location: string | null;
  host_id: string;
  grading_scale: MatchGradingScale;
  min_grade: number | null;
  max_grade: number | null;
  /** Default for this Match's routes; each may override it. */
  discipline: Discipline;
  status: MatchStatus;
  starts_at: string;
  /** Null while live — a Match is open-ended until someone ends it. */
  ends_at: string | null;
  last_activity_at: string | null;
}

export interface MatchGrade {
  set_id: string;
  ordinal: number;
  label: string;
}

export interface MatchPlayer {
  set_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_host: boolean;
}

/** A Match route — the `routes` row. */
export interface MatchRoute {
  id: string;
  set_id: string;
  number: number;
  description: string | null;
  /**
   * What the adder said this route is. Named `declared_grade` in the
   * DB (migration 083) to distinguish it from `community_grade`,
   * which is what climbers voted.
   */
  declared_grade: number | null;
  /**
   * The rounded average of climbers' grade votes, maintained by
   * trigger. Gym routes generally have only this; Match routes
   * generally only `declared_grade`.
   */
  community_grade: number | null;
  has_zone: boolean;
  added_by: string | null;
  /**
   * Overrides the Match's discipline. Null = inherit, which is the
   * common case — the RPC normalises a value equal to the Match's own
   * back to null, so changing the Match default still moves this
   * route with it.
   */
  discipline: Discipline | null;
  created_at: string;
}

/**
 * A Match log — the `route_logs` row.
 *
 * Structurally identical to a gym log, because it is one. `set_id` is
 * derived by trigger (migration 081) and `gym_id` is null.
 */
export interface MatchLog {
  id: string;
  set_id: string;
  route_id: string;
  /** Null when a guest owns this log — see `player_id`. */
  user_id: string | null;
  /** The guest seat that owns this log; null for an account's. */
  player_id: string | null;
  attempts: number;
  completed: boolean;
  completed_at: string | null;
  zone: boolean;
  created_at: string;
  updated_at: string;
}

export interface MatchPlayerView {
  /** The seat. Present for everyone; the only id a guest has. */
  player_id: string;
  /** The account behind the seat — null for a guest. */
  user_id: string | null;
  /**
   * A guest: a named seat with no account, whose sends the host
   * enters. See migration 095 and CONTEXT.md "Guest players".
   */
  is_guest: boolean;
  username: string | null;
  /** The profile's name, or the seat's own for a guest. */
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
  is_host: boolean;
  /**
   * This player's declared limit, as an index into the Match's scale.
   * Null = no handicap for them; they score base points.
   */
  ceiling: number | null;
}

export interface MatchLeaderboardRow {
  player_id: string;
  /**
   * The score the board actually ranks on, in TENTHS.
   *
   * Equal to `points * 10` when the Match has no handicap, so display
   * code can read this one field either way — `formatHandicapPoints`
   * drops the pointless decimal.
   */
  points_tenths: number;
  /** Null for a guest — they have no account. */
  user_id: string | null;
  is_guest: boolean;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  sends: number;
  flashes: number;
  zones: number;
  points: number;
  /** Own count only — every other player reads 0. */
  attempts: number;
  last_send_at: string | null;
  rank: number;
}

/** `get_match_state_for_user` bundled payload. */
export interface MatchState {
  match: Match;
  grades: Array<{ ordinal: number; label: string }>;
  routes: MatchRoute[];
  players: MatchPlayerView[];
  /** The caller's logs only. */
  my_logs: MatchLog[];
  /**
   * Every guest's logs — returned to the HOST only, because the host
   * entered them and is the one person for whom they aren't someone
   * else's private data. Empty for everyone else.
   */
  guest_logs: MatchLog[];
  leaderboard: MatchLeaderboardRow[];
}

/** Resume-banner payload (minimal). */
export interface ActiveMatchSummary {
  set_id: string;
  name: string | null;
  location: string | null;
  code: string;
  player_count: number;
  joined_at: string;
}

/** `lookup_match_by_code` payload — safe to display before joining. */
export interface JoinMatchLookup {
  set_id: string;
  name: string | null;
  location: string | null;
  host_username: string | null;
  host_display_name: string | null;
  player_count: number;
  grading_scale: MatchGradingScale;
  status: MatchStatus;
  at_cap: boolean;
}

/**
 * History row in the profile + Match tab recent list.
 *
 * Derived live from `route_logs` by `get_match_history`, not read
 * from a stored snapshot — which is what keeps a tied Match ranked
 * the same here as it is on the board.
 */
export interface MatchHistoryRow {
  set_id: string;
  name: string | null;
  location: string | null;
  ended_at: string;
  started_at: string;
  duration_seconds: number;
  player_count: number;
  user_rank: number;
  user_sends: number;
  user_flashes: number;
  user_points: number;
  user_is_winner: boolean;
  winner_user_id: string | null;
  winner_username: string | null;
  winner_display_name: string | null;
}

/** Saved custom scale + its grades (for the create-Match picker). */
export interface SavedScale {
  id: string;
  name: string;
  grades: Array<{ ordinal: number; label: string }>;
  created_at: string;
}

/** Match achievement context — drives badge evaluation. */
export interface MatchAchievementContext {
  matches_played: number;
  matches_won: number;
  matches_hosted: number;
  max_players_in_won_match: number;
  unique_coplayers: number;
  max_iron_crew_pair_count: number;
  match_total_flashes: number;
  match_total_sends: number;
  match_total_points: number;
}

/**
 * Who a log or board row belongs to, as one string.
 *
 * A Match seat is held either by an account or by a guest, and the
 * two are identified by different columns — `user_id` and
 * `player_id`. Client code that needs to say "these belong together"
 * (keying the log map, matching a log to its board row, deciding
 * which tile to paint) wants one id, not a branch at every call site.
 *
 * Both overloads resolve to the same string for the same person: an
 * account's `user_id`, or a guest's seat id.
 */
export function ownerIdOf(
  owner: { user_id: string | null; player_id?: string | null },
): string {
  // A row always has one or the other — `route_logs_owner_ck` and
  // `set_players_identity_ck` both enforce exactly-one.
  return owner.user_id ?? owner.player_id ?? "";
}
