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
export type Follow = Tables["follows"]["Row"];

// ── Leaderboard ────────────────────────────────────

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  name: string;
  avatar_url: string;
  rank: number | null;   // null = unranked (no qualifying logs)
  sends: number;
  flashes: number;
  zones: number;
  points: number;
}

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

// ── Mutation types ─────────────────────────────────

export type RouteLogUpdate = Tables["route_logs"]["Update"];

// ── Pagination ─────────────────────────────────────

export interface PaginatedComments {
  items: Comment[];
  totalItems: number;
  totalPages: number;
  page: number;
}

// ── Domain enums ───────────────────────────────────
// Define values as const arrays, derive types from them.
// This keeps runtime validation and TypeScript types in sync.

export const ACTIVITY_EVENT_TYPES = ["completed", "flashed", "beta_spray", "reply"] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export const GYM_ROLES = ["climber", "setter", "admin", "owner"] as const;
export type GymRole = (typeof GYM_ROLES)[number];

// ── UI types ───────────────────────────────────────

export const TILE_STATES = ["empty", "attempted", "completed", "flash"] as const;
export type TileState = (typeof TILE_STATES)[number];

// ── Helpers ────────────────────────────────────────

/**
 * Create an optimistic RouteLog for immediate UI updates.
 * Client-side only — never sent to Supabase.
 */
export function createOptimisticLog(fields: {
  id: string;
  user_id: string;
  route_id: string;
  gym_id: string;
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
