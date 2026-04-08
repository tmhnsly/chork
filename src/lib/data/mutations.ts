import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { createServiceClient } from "../supabase/server";
import type {
  RouteLog,
  RouteLogUpdate,
  Comment,
  ActivityEvent,
  ActivityEventType,
  CommentLike,
} from "./types";

type Supabase = SupabaseClient<Database>;

// ── Route logs ─────────────────────────────────────

/**
 * Create or update a route log using Supabase upsert.
 * The unique constraint on (user_id, route_id) handles the conflict.
 */
export async function upsertRouteLog(
  supabase: Supabase,
  userId: string,
  routeId: string,
  data: RouteLogUpdate,
  existingLogId?: string
): Promise<RouteLog> {
  if (existingLogId) {
    const { data: log, error } = await supabase
      .from("route_logs")
      .update(data)
      .eq("id", existingLogId)
      .select()
      .single();
    if (error) throw error;
    return log;
  }

  const { data: log, error } = await supabase
    .from("route_logs")
    .upsert(
      { user_id: userId, route_id: routeId, ...data },
      { onConflict: "user_id,route_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return log;
}

// ── Comments ───────────────────────────────────────

export async function createComment(
  supabase: Supabase,
  data: { user_id: string; route_id: string; body: string }
): Promise<Comment> {
  const { data: comment, error } = await supabase
    .from("comments")
    .insert(data)
    .select("*, profiles(id, username, name, avatar_url)")
    .single();
  if (error) throw error;
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
  return comment as Comment;
}

// ── Comment likes ──────────────────────────────────

/**
 * Toggle a like on a comment.
 * Uses the service role client to update the denormalized likes count
 * (the comments RLS policy restricts updates to the comment owner).
 */
export async function toggleCommentLike(
  supabase: Supabase,
  userId: string,
  commentId: string
): Promise<{ liked: boolean; likes: number }> {
  // Check if already liked
  const { data: existing } = await supabase
    .from("comment_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("comment_id", commentId)
    .maybeSingle();

  const service = createServiceClient();

  if (existing) {
    // Unlike: delete the record, decrement count
    await supabase
      .from("comment_likes")
      .delete()
      .eq("id", existing.id);

    const { data: updated } = await service
      .from("comments")
      .update({ likes: Math.max(0, -1) }) // placeholder
      .eq("id", commentId)
      .select("likes")
      .single();

    // Use raw SQL decrement via RPC or direct update
    // Supabase doesn't have atomic increment syntax in PostgREST,
    // so we read-then-write with the service client
    const { data: current } = await service
      .from("comments")
      .select("likes")
      .eq("id", commentId)
      .single();

    const newLikes = Math.max(0, (current?.likes ?? 0) - 1);
    await service
      .from("comments")
      .update({ likes: newLikes })
      .eq("id", commentId);

    return { liked: false, likes: newLikes };
  }

  // Like: create the record, increment count
  await supabase
    .from("comment_likes")
    .insert({ user_id: userId, comment_id: commentId });

  const { data: current } = await service
    .from("comments")
    .select("likes")
    .eq("id", commentId)
    .single();

  const newLikes = (current?.likes ?? 0) + 1;
  await service
    .from("comments")
    .update({ likes: newLikes })
    .eq("id", commentId);

  return { liked: true, likes: newLikes };
}

// ── Activity events ────────────────────────────────

export async function createActivityEvent(
  supabase: Supabase,
  data: { user_id: string; route_id: string; type: ActivityEventType }
): Promise<ActivityEvent> {
  const { data: event, error } = await supabase
    .from("activity_events")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return event;
}

/**
 * Delete completion/flash activity events for a user + route.
 * Uses service role because RLS doesn't allow user deletes on activity_events.
 */
export async function deleteCompletionEvents(
  supabase: Supabase,
  userId: string,
  routeId: string
): Promise<void> {
  const service = createServiceClient();
  await service
    .from("activity_events")
    .delete()
    .eq("user_id", userId)
    .eq("route_id", routeId)
    .in("type", ["completed", "flashed"]);
}

// ── Gym memberships ────────────────────────────────

export async function createGymMembership(
  supabase: Supabase,
  userId: string,
  gymId: string,
  role: string = "climber"
): Promise<void> {
  const { error } = await supabase
    .from("gym_memberships")
    .insert({ user_id: userId, gym_id: gymId, role });
  if (error) throw error;
}
