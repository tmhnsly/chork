/**
 * Domain types for collections not yet in pocketbase-typegen.
 * Once PocketBase schema is created and typegen runs, these
 * should be replaced by the generated types.
 */

export interface Set {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  created: string;
  updated: string;
}

export interface Route {
  id: string;
  set_id: string;
  number: number;
  has_zone: boolean;
  created: string;
  updated: string;
}

export interface RouteLog {
  id: string;
  user_id: string;
  route_id: string;
  attempts: number;
  completed: boolean;
  completed_at: string | null;
  grade_vote: number | null;
  zone: boolean;
  created: string;
  updated: string;
}

export interface Comment {
  id: string;
  user_id: string;
  route_id: string;
  body: string;
  created: string;
  updated: string;
  expand?: {
    user_id?: { id: string; collectionId: string; username: string; name: string; avatar: string };
  };
}

export interface PaginatedComments {
  items: Comment[];
  totalItems: number;
  totalPages: number;
  page: number;
}

export type ActivityEventType = "completed" | "flashed" | "beta_spray" | "reply";

export interface ActivityEvent {
  id: string;
  user_id: string;
  route_id: string;
  type: ActivityEventType;
  created: string;
  updated: string;
  expand?: {
    route_id?: Route & {
      expand?: { set_id?: Set };
    };
  };
}

/** RouteLog with route_id expanded to access set_id. */
export interface RouteLogWithSetId extends RouteLog {
  expand?: {
    route_id?: { set_id: string };
  };
}

export type TileState = "empty" | "attempted" | "completed" | "flash";

// ── PocketBase View types ──────────────────────────

/** Row from the `route_grades` PocketBase View collection. */
export interface RouteGradeView {
  id: string;
  route_id: string;
  community_grade: number;
  vote_count: number;
}

/** Row from the `user_set_stats` PocketBase View collection. */
export interface UserSetStatsView {
  id: string;
  user_id: string;
  set_id: string;
  completions: number;
  flashes: number;
  points: number;
}
