/**
 * Domain types derived from Supabase generated types.
 */

import type { Database } from "../database.types";

type Tables = Database["public"]["Tables"];

// ── Base table row types ───────────────────────────

export type Profile = Tables["profiles"]["Row"];
export type Gym = Tables["gyms"]["Row"];
export type GymMembership = Tables["gym_memberships"]["Row"];
export type RouteSet = Tables["sets"]["Row"];
export type Route = Tables["routes"]["Row"];
export type RouteLog = Tables["route_logs"]["Row"];
export type CommentLike = Tables["comment_likes"]["Row"];
export type ActivityEvent = Tables["activity_events"]["Row"];

// ── Types with joined data ─────────────────────────

export type Comment = Tables["comments"]["Row"] & {
  profiles?: Pick<Profile, "id" | "username" | "name" | "avatar_url"> | null;
};

export type ActivityEventWithRoute = ActivityEvent & {
  routes?: Pick<Route, "number"> | null;
};

export type RouteLogWithSetId = RouteLog & {
  routes?: Pick<RouteSet, "id"> | null;
};

// ── Insert types ───────────────────────────────────

export type RouteLogInsert = Tables["route_logs"]["Insert"];
export type RouteLogUpdate = Tables["route_logs"]["Update"];
export type CommentInsert = Tables["comments"]["Insert"];
export type ActivityEventInsert = Tables["activity_events"]["Insert"];
export type GymMembershipInsert = Tables["gym_memberships"]["Insert"];

// ── Pagination ─────────────────────────────────────

export interface PaginatedComments {
  items: Comment[];
  totalItems: number;
  totalPages: number;
  page: number;
}

// ── Domain enums ───────────────────────────────────

export type ActivityEventType = "completed" | "flashed" | "beta_spray" | "reply";
export type GymRole = "climber" | "setter" | "admin" | "owner";

// ── UI types ───────────────────────────────────────

export type TileState = "empty" | "attempted" | "completed" | "flash";

// ── Helpers ────────────────────────────────────────

/**
 * Create an optimistic RouteLog for immediate UI updates.
 * Client-side only — never sent to Supabase.
 */
export function createOptimisticLog(fields: {
  id: string;
  user_id: string;
  route_id: string;
  attempts: number;
  completed: boolean;
  grade_vote?: number | null;
  zone: boolean;
}): RouteLog {
  const now = new Date().toISOString();
  return {
    completed_at: fields.completed ? now : null,
    grade_vote: fields.grade_vote ?? null,
    created_at: now,
    updated_at: now,
    ...fields,
  };
}
