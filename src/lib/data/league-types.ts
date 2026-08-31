// src/lib/data/league-types.ts
// Client-safe — no `server-only`, no supabase import. What the League
// RPCs return (migration 133).

export interface LeagueRow {
  id: string;
  host_id: string;
  name: string;
  created_at: string;
  /** Null while running. An ended League takes no more weeks. */
  ended_at: string | null;
}

/** One Match of the League, as `get_league` lists it. */
export interface LeagueWeek {
  set_id: string;
  name: string | null;
  status: "live" | "archived";
  game_mode: "points" | "chork";
  starts_at: string;
  ends_at: string | null;
  player_count: number;
  /** Null while live, or when the winner was a guest. */
  winner_user_id: string | null;
}

export interface LeagueView {
  league: LeagueRow;
  is_host: boolean;
  /** Newest first. A live one is "this week, in progress". */
  weeks: LeagueWeek[];
}

/** One row of the table — `league_standings`. Account-holders only. */
export interface LeagueStanding {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  played: number;
  points: number;
  /** What the drop rule took off — shown muted when non-zero. */
  dropped_points: number;
  firsts: number;
  seconds: number;
  thirds: number;
  rank: number;
}

/** `get_my_leagues` — the landing list. */
export interface MyLeagueRow {
  id: string;
  name: string;
  host_id: string;
  is_host: boolean;
  ended_at: string | null;
  week_count: number;
  last_week_at: string | null;
  /** Null until the caller has placed in a week. */
  my_rank: number | null;
}
