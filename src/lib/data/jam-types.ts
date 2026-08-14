// Match domain types.
//
// A **Match** is a climber-run Set: same container as a gym Set, at
// different settings. See CONTEXT.md. Since the convergence
// (migrations 080–086) these shapes describe rows in `sets` /
// `routes` / `route_logs` / `set_players`, not the retired `jam_*`
// mirror.
//
// The file is still named `jam-types.ts` and still exports `Jam*`
// names on purpose: renaming the code is its own pass, done once the
// `jam_*` TABLES are dropped, so that this change is a pure
// data-source swap and reviewable as one. See docs/roadmap.md.
//
// Keeping the shapes here rather than importing
// `Database["public"]["Tables"]` at every call site means generated-
// type drift surfaces as compile errors in one file.

import type { GradingScaleWithCustom } from "./grade-label";

// The scale union lives in grade-label.ts (the single source of truth
// for grade → label resolution); this alias keeps Match call sites on
// their domain-local name.
export type JamGradingScale = GradingScaleWithCustom;

/**
 * A Match's lifecycle, in the vocabulary the UI speaks.
 *
 * The column underneath is `sets.status`, whose domain is
 * `draft | live | archived` across both kinds of Set — `archived`
 * means "finished" for a Match. Deliberately not a separate `ended`
 * value: two words for one state is how the legacy `active`/`status`
 * split started (see migration 080).
 */
export type JamStatus = "live" | "archived";

/** A Match — the `sets` row, narrowed to `owner_kind = 'climber'`. */
export interface Jam {
  id: string;
  code: string;
  name: string | null;
  location: string | null;
  host_id: string;
  grading_scale: JamGradingScale;
  min_grade: number | null;
  max_grade: number | null;
  status: JamStatus;
  starts_at: string;
  /** Null while live — a Match is open-ended until someone ends it. */
  ends_at: string | null;
  last_activity_at: string | null;
}

export interface JamGrade {
  set_id: string;
  ordinal: number;
  label: string;
}

export interface JamPlayer {
  set_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_host: boolean;
}

/** A Match route — the `routes` row. */
export interface JamRoute {
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
  has_zone: boolean;
  added_by: string | null;
  created_at: string;
}

/**
 * A Match log — the `route_logs` row.
 *
 * Structurally identical to a gym log, because it is one. `set_id` is
 * derived by trigger (migration 081) and `gym_id` is null.
 */
export interface JamLog {
  id: string;
  set_id: string;
  route_id: string;
  user_id: string;
  attempts: number;
  completed: boolean;
  completed_at: string | null;
  zone: boolean;
  created_at: string;
  updated_at: string;
}

export interface JamPlayerView {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
  is_host: boolean;
}

export interface JamLeaderboardRow {
  user_id: string;
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
export interface JamState {
  jam: Jam;
  grades: Array<{ ordinal: number; label: string }>;
  routes: JamRoute[];
  players: JamPlayerView[];
  /** The caller's logs only. */
  my_logs: JamLog[];
  leaderboard: JamLeaderboardRow[];
}

/** Resume-banner payload (minimal). */
export interface ActiveJamSummary {
  set_id: string;
  name: string | null;
  location: string | null;
  code: string;
  player_count: number;
  joined_at: string;
}

/** `lookup_match_by_code` payload — safe to display before joining. */
export interface JoinJamLookup {
  set_id: string;
  name: string | null;
  location: string | null;
  host_username: string | null;
  host_display_name: string | null;
  player_count: number;
  grading_scale: JamGradingScale;
  status: JamStatus;
  at_cap: boolean;
}

/**
 * History row in the profile + Match tab recent list.
 *
 * Derived live from `route_logs` by `get_match_history`, not read
 * from a stored snapshot — which is what keeps a tied Match ranked
 * the same here as it is on the board.
 */
export interface JamHistoryRow {
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
export interface JamAchievementContext {
  jams_played: number;
  jams_won: number;
  jams_hosted: number;
  max_players_in_won_jam: number;
  unique_coplayers: number;
  max_iron_crew_pair_count: number;
  jam_total_flashes: number;
  jam_total_sends: number;
  jam_total_points: number;
}
