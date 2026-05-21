import "server-only";

import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { tags } from "@/lib/cache/tags";
type Supabase = SupabaseClient<Database>;

/**
 * Bust both profile cache tags for a user.
 *
 * `getProfileByUsername` is keyed + tagged by username (the cache key
 * input), but most mutations only know the userId. This helper looks
 * up the current username so the by-username cache entry actually
 * invalidates. Skip the lookup and the user keeps seeing stale profile
 * data for up to the cache TTL.
 *
 * Use after any profile-row mutation that changes a field rendered on
 * /u/[username]: active_gym_id, theme, allow_crew_invites, admin
 * additions, etc. updateProfile (which already handles renames) calls
 * this directly with the captured old + new usernames instead.
 */
export async function revalidateUserProfile(
  supabase: Supabase,
  userId: string,
): Promise<void> {
  revalidateTag(tags.userProfile(userId), "max");
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (data?.username) {
    revalidateTag(tags.userByUsername(data.username), "max");
  }
}

/**
 * Bust the tags that any route-log write affects.
 *
 * Every route-log mutation (complete, uncomplete, attempt updates that
 * change visible state) needs to invalidate two distinct cache entries
 * together: the leaderboard for the set the route belongs to, and the
 * climber's own stats. The coupling is non-obvious — a new mutation
 * type can easily remember the leaderboard and forget userStats, or
 * vice versa, producing a 60-second window of stale UI.
 *
 * `setId` is nullable because route_logs.set_id can occasionally be
 * null (route fetched without its parent set joined). The helper
 * skips the leaderboard bust in that case so callers don't repeat
 * the `if (setId)` guard at every site.
 */
export function revalidateRouteLogTags(
  setId: string | null,
  userId: string,
): void {
  if (setId) revalidateTag(tags.setLeaderboard(setId), "max");
  revalidateTag(tags.userStats(userId), "max");
}
