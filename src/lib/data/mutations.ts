import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { createServiceClient } from "../supabase/server";
import {
  GYM_ROLES,
  type RouteLog,
  type RouteLogUpdate,
  type Comment,
  type ActivityEvent,
  type ActivityEventType,
  type GymRole,
} from "./types";

/**
 * ── Error contract ────────────────────────────────────────────────
 *
 * Mutations in this file (and every `*-mutations.ts` sibling)
 * **throw** on Postgres error. The calling server action wraps the
 * mutation in try/catch and forwards via `formatError(err)` — that's
 * where the friendly mapping happens.
 *
 * Why throw? Mutations alter shared state; "silently swallow + return
 * null" would let the caller think the write succeeded and skip its
 * post-write tag busts / push dispatch / activity log. Reads in
 * `queries.ts` use the opposite contract (swallow + return neutral
 * fallback) since render paths handle absence the same as failure.
 */
type Supabase = SupabaseClient<Database>;

// ── Route logs ─────────────────────────────────────

/**
 * The returned row carries `set_id`, so callers can target precise
 * `set:{setId}:leaderboard` invalidations without a second query.
 *
 * @deprecated Alias kept only so call sites read clearly during the
 * convergence. `set_id` is a real column since migration 080, so this
 * is now exactly `RouteLog` — collapse it when the jam_* tables go.
 */
export type UpsertedRouteLog = RouteLog;

export async function upsertRouteLog(
  supabase: Supabase,
  userId: string,
  routeId: string,
  data: RouteLogUpdate,
  existingLogId?: string,
  gymId?: string | null
): Promise<UpsertedRouteLog> {
  if (existingLogId) {
    if (!gymId) throw new Error("gym_id is required to update a route log");
    // Scope by gym_id too — a user in multiple gyms can't accidentally
    // update a log scoped to a different gym by passing its id.
    const { data: log, error } = await supabase
      .from("route_logs")
      .update(data)
      .eq("id", existingLogId)
      .eq("user_id", userId)
      .eq("gym_id", gymId)
      .select("*")
      .single();
    if (error) throw error;
    return log;
  }

  if (!gymId) throw new Error("gym_id is required when creating a route log");

  const { data: log, error } = await supabase
    .from("route_logs")
    .upsert(
      // `set_id` is deliberately omitted: it's derived from the route
      // by a trigger (migration 081) so a caller can't name a set the
      // route doesn't belong to. The cast is because the generated
      // Insert type sees a NOT NULL column with no default and can't
      // know a trigger fills it.
      { user_id: userId, route_id: routeId, gym_id: gymId, ...data } as never,
      { onConflict: "user_id,route_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return log;
}

// ── Comments ───────────────────────────────────────

export async function createComment(
  supabase: Supabase,
  data: { user_id: string; route_id: string; body: string; gym_id: string }
): Promise<Comment> {
  const { data: comment, error } = await supabase
    .from("comments")
    .insert(data)
    .select("*, profiles(id, username, name, avatar_url)")
    .single();
  if (error) throw error;
  if (!comment) throw new Error("Comment creation returned no data");
  return comment as Comment;
}

export async function updateComment(
  supabase: Supabase,
  commentId: string,
  body: string
): Promise<Comment> {
  const { data: comment, error } = await supabase
    .from("comments")
    .update({ body })
    .eq("id", commentId)
    .select("*, profiles(id, username, name, avatar_url)")
    .single();
  if (error) throw error;
  if (!comment) throw new Error("Comment update returned no data");
  return comment as Comment;
}

// ── Comment likes ──────────────────────────────────

export async function toggleCommentLike(
  supabase: Supabase,
  userId: string,
  commentId: string,
  gymId: string
): Promise<{ liked: boolean; likes: number }> {
  const { data: existing, error: readError } = await supabase
    .from("comment_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("comment_id", commentId)
    .maybeSingle();

  // Surface RLS / network errors explicitly instead of silently
  // treating them as "no row exists." If the read was blocked
  // (policy mismatch, gym drift, transient outage), we don't know
  // whether the user has liked the comment — proceeding to INSERT
  // could hit the unique constraint and surface "duplicate key" to
  // the user, while proceeding to DELETE could no-op without
  // updating the counter. Bail out with a useful error instead.
  if (readError) throw readError;

  // comments.likes is maintained atomically by the comment_likes
  // AFTER INSERT/DELETE trigger (migration 068): the row change and the
  // counter move commit together in one statement, and cascade-deleted
  // likes decrement correctly (fixing the old app-RPC-only drift). We
  // just mirror the row change, then re-read the authoritative count.
  if (existing) {
    const { error: deleteError } = await supabase
      .from("comment_likes")
      .delete()
      .eq("id", existing.id);
    if (deleteError) throw deleteError;
    const { data: comment } = await supabase
      .from("comments")
      .select("likes")
      .eq("id", commentId)
      .maybeSingle();
    return { liked: false, likes: comment?.likes ?? 0 };
  }

  // The unique(user_id, comment_id) constraint makes a double-like race
  // throw on the second insert rather than double-count.
  const { error: insertError } = await supabase
    .from("comment_likes")
    .insert({ user_id: userId, comment_id: commentId, gym_id: gymId });
  if (insertError) throw insertError;
  const { data: comment } = await supabase
    .from("comments")
    .select("likes")
    .eq("id", commentId)
    .maybeSingle();
  return { liked: true, likes: comment?.likes ?? 0 };
}

// ── Activity events ────────────────────────────────

export async function createActivityEvent(
  supabase: Supabase,
  data: { user_id: string; route_id: string; type: ActivityEventType; gym_id: string }
): Promise<ActivityEvent> {
  const { data: event, error } = await supabase
    .from("activity_events")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return event;
}

export async function deleteCompletionEvents(
  supabase: Supabase,
  userId: string,
  routeId: string,
  gymId: string,
): Promise<void> {
  // Service role bypasses RLS, so app code must scope every filter we'd
  // otherwise lean on RLS for. Without gym_id, a route-id collision (or
  // a future "shared route" feature) would let one gym's uncomplete
  // delete a user's events from another gym silently.
  const service = createServiceClient();
  const { error } = await service
    .from("activity_events")
    .delete()
    .eq("user_id", userId)
    .eq("route_id", routeId)
    .eq("gym_id", gymId)
    .in("type", ["completed", "flashed"]);
  if (error) throw error;
}

// ── Gym memberships ────────────────────────────────

export async function createGymMembership(
  supabase: Supabase,
  userId: string,
  gymId: string,
  role: GymRole = "climber"
): Promise<void> {
  if (!GYM_ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
  const { error } = await supabase
    .from("gym_memberships")
    .insert({ user_id: userId, gym_id: gymId, role });
  if (error) throw error;
}
