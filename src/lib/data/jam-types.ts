// Jam domain types.
//
// These manual declarations match migrations 041 + 042. Once
// database.types.ts is regenerated (`npx supabase gen types
// typescript --project-id <id>`), the shapes here match the
// generated Database["public"]["Tables"] rows one-for-one. Keeping
// them in a dedicated file means the feature code doesn't import
// from `database.types.ts` directly — if the generated file drifts
// from the migrations, the compile errors land here, not scattered
// across every call site.

export type JamGradingScale = "v" | "font" | "custom" | "points";
export type JamStatus = "live" | "ended";

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
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
  created_at: string;
}

export interface JamGrade {
  jam_id: string;
  ordinal: number;
  label: string;
}

export interface JamPlayer {
  jam_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
}

export interface JamRoute {
  id: string;
  jam_id: string;
  number: number;
  description: string | null;
  grade: number | null;
  has_zone: boolean;
  added_by: string | null;
  created_at: string;
}

export interface JamLog {
  id: string;
  jam_id: string;
  jam_route_id: string;
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
  attempts: number;
  last_send_at: string | null;
  rank: number;
}

// get_jam_state bundled payload.
export interface JamState {
  jam: Jam;
  grades: Array<{ ordinal: number; label: string }>;
  routes: JamRoute[];
  players: JamPlayerView[];
  my_logs: JamLog[];
  leaderboard: JamLeaderboardRow[];
}

// Active jam banner payload (minimal).
export interface ActiveJamSummary {
  jam_id: string;
  name: string | null;
  location: string | null;
  code: string;
  player_count: number;
  joined_at: string;
}

// join_jam_by_code lookup payload — safe to display before joining.
export interface JoinJamLookup {
  jam_id: string;
  name: string | null;
  location: string | null;
  host_username: string | null;
  host_display_name: string | null;
  player_count: number;
  grading_scale: JamGradingScale;
  status: JamStatus;
  at_cap: boolean;
}

// History row in the profile + jam-tab recent list.
export interface JamHistoryRow {
  summary_id: string;
  jam_id: string;
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

export interface JamSummaryPlayer {
  user_id: string | null;
  username: string;
  display_name: string;
  rank: number;
  sends: number;
  flashes: number;
  zones: number;
  points: number;
  attempts: number;
  is_winner: boolean;
  avatar_url: string | null;
}

export interface JamSummary {
  id: string;
  jam_id: string;
  name: string | null;
  location: string | null;
  host_id: string | null;
  grading_scale: JamGradingScale;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  player_count: number;
  winner_user_id: string | null;
  payload: {
    grading_scale: JamGradingScale;
    min_grade: number | null;
    max_grade: number | null;
    grades: Array<{ ordinal: number; label: string }> | null;
    top_routes: Array<{
      number: number;
      grade: number | null;
      has_zone: boolean;
      total_attempts: number;
      sends: number;
    }>;
  };
  created_at: string;
}

export interface JamSummaryBundle {
  summary: JamSummary;
  players: JamSummaryPlayer[];
}

// Saved custom scale + its grades (for the create-jam picker).
export interface SavedScale {
  id: string;
  name: string;
  grades: Array<{ ordinal: number; label: string }>;
  created_at: string;
}

// Unified all-time stats returned by get_user_all_time_stats.
export interface UserAllTimeStats {
  total_sends: number;
  total_flashes: number;
  total_zones: number;
  total_points: number;
  total_attempts: number;
  unique_routes_attempted: number;
  jams_played: number;
  jams_won: number;
}

// Jam achievement context — drives badge evaluation.
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
