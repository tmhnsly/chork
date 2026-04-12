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

type Supabase = SupabaseClient<Database>;

// ── Route logs ─────────────────────────────────────

export async function upsertRouteLog(
  supabase: Supabase,
  userId: string,
  routeId: string,
  data: RouteLogUpdate,
  existingLogId?: string,
  gymId?: string | null
): Promise<RouteLog> {
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
      .select()
      .single();
    if (error) throw error;
    return log;
  }

  if (!gymId) throw new Error("gym_id is required when creating a route log");

  const { data: log, error } = await supabase
    .from("route_logs")
    .upsert(
      { user_id: userId, route_id: routeId, gym_id: gymId, ...data },
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
  const { data: existing } = await supabase
    .from("comment_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("comment_id", commentId)
    .maybeSingle();

  const service = createServiceClient();

  if (existing) {
    const { error: deleteError } = await supabase
      .from("comment_likes")
      .delete()
      .eq("id", existing.id);
    if (deleteError) throw deleteError;

    // Atomic decrement — no race condition
    const { data: newLikes, error: rpcError } = await service
      .rpc("increment_comment_likes", { p_comment_id: commentId, p_delta: -1 });
    if (rpcError) throw rpcError;

    return { liked: false, likes: newLikes ?? 0 };
  }

  const { error: insertError } = await supabase
    .from("comment_likes")
    .insert({ user_id: userId, comment_id: commentId, gym_id: gymId });
  if (insertError) throw insertError;

  // Atomic increment — no race condition
    const { data: newLikes, error: rpcError } = await service
      .rpc("increment_comment_likes", { p_comment_id: commentId, p_delta: 1 });
    if (rpcError) throw rpcError;

    return { liked: true, likes: newLikes ?? 0 };
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
  routeId: string
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("activity_events")
    .delete()
    .eq("user_id", userId)
    .eq("route_id", routeId)
    .in("type", ["completed", "flashed"]);
  if (error) throw error;
}

// ── Follows ───────────────────────────────────────

export async function toggleFollow(
  supabase: Supabase,
  followerId: string,
  followingId: string
): Promise<{ following: boolean; followerCount: number }> {
  // Try to insert first — ON CONFLICT means they already follow
  const { error: insertError } = await supabase
    .from("follows")
    .insert({ follower_id: followerId, following_id: followingId });

  let nowFollowing: boolean;

  if (insertError && insertError.code === "23505") {
    // Unique violation — already following, so unfollow
    const { error: deleteError } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    if (deleteError) throw deleteError;
    nowFollowing = false;
  } else if (insertError) {
    throw insertError;
  } else {
    nowFollowing = true;
  }

  // Read back fresh follower count (trigger has already fired)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("follower_count")
    .eq("id", followingId)
    .single();
  if (profileError) throw profileError;

  return {
    following: nowFollowing,
    followerCount: profile.follower_count,
  };
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
