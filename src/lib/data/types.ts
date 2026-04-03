/**
 * Domain types derived from generated PocketBase types.
 * These add specific expand shapes and override optionality
 * where the generated Required<> doesn't match runtime behaviour.
 */

import type {
  SetsResponse,
  RoutesResponse,
  RouteLogsResponse,
  CommentsResponse,
  CommentLikesResponse,
  ActivityEventsResponse,
  RouteGradesResponse,
  UserSetStatsResponse,
  ActivityEventsTypeOptions,
} from "../pocketbase-types";

// Re-export the enum values as a union for ergonomic use
export type ActivityEventType = `${ActivityEventsTypeOptions}`;

// ── Base collection types ──────────────────────────
// Use the generated response types directly.
// Consumers get id, created, updated, collectionId, etc. for free.

export type RouteSet = SetsResponse;
export type Route = RoutesResponse;
export type CommentLike = CommentLikesResponse;

// ── Types with custom expand shapes ────────────────

export type RouteLog = RouteLogsResponse;

export type RouteLogWithSetId = RouteLogsResponse<{
  route_id?: { set_id: string };
}>;

export type Comment = CommentsResponse<{
  user_id?: {
    id: string;
    collectionId: string;
    username: string;
    name: string;
    avatar: string;
  };
}>;

export type ActivityEvent = ActivityEventsResponse<{
  route_id?: RoutesResponse<{ set_id?: SetsResponse }>;
}>;

// ── Pagination ─────────────────────────────────────

export interface PaginatedComments {
  items: Comment[];
  totalItems: number;
  totalPages: number;
  page: number;
}

// ── View collection types ──────────────────────────

export type RouteGradeView = RouteGradesResponse<number>;

export type UserSetStatsView = UserSetStatsResponse<number, number, number>;

// ── UI types ───────────────────────────────────────

export type TileState = "empty" | "attempted" | "completed" | "flash";

// ── Helpers ────────────────────────────────────────

/**
 * Create an optimistic RouteLog for immediate UI updates.
 * Uses type assertion for branded date strings since these
 * logs are client-side only and never sent to PocketBase.
 */
export function createOptimisticLog(fields: {
  id: string;
  user_id: string;
  route_id: string;
  attempts: number;
  completed: boolean;
  grade_vote?: number;
  zone: boolean;
}): RouteLog {
  const now = new Date().toISOString();
  return {
    collectionId: "",
    collectionName: "route_logs",
    completed_at: fields.completed ? now : "",
    grade_vote: fields.grade_vote ?? 0,
    created: now,
    updated: now,
    ...fields,
  } as RouteLog;
}
