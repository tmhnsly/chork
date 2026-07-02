import "server-only";

import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { tags } from "@/lib/cache/tags";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
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
 * Fan-out tag invalidation for a crew mutation: bust `crew:{id}` plus
 * every active member's `user:{uid}:crews` tag.
 *
 * Crew mutations change what *other* members see (roster, member
 * counts, /crew picker cards), so the userCrews bust has to fan out
 * across the whole active roster — busting only the actor's tag
 * leaves everyone else's crew surfaces stale for up to 60s.
 *
 * `extraUserIds` covers users who no longer (or never did) appear in
 * crew_members — the member who just left, was removed, or declined —
 * so their own crews tag busts alongside the remaining active set.
 *
 * A failed member fetch is logged, never silently swallowed — without
 * the log line the only evidence is a stale /crew/[id] page. The
 * fan-out continues with whatever rows we have (plus extraUserIds) so
 * transient network noise doesn't block the partial bust.
 */
export async function revalidateCrewMembers(
  supabase: Supabase,
  crewId: string,
  extraUserIds: string[] = [],
): Promise<void> {
  revalidateTag(tags.crew(crewId), "max");
  const { data: members, error } = await supabase
    .from("crew_members")
    .select("user_id")
    .eq("crew_id", crewId)
    .eq("status", "active");
  if (error) {
    logger.warn("revalidateCrewMembers_failed", {
      crewId,
      err: formatErrorForLog(error),
    });
  }
  const seen = new Set<string>();
  if (Array.isArray(members)) {
    for (const m of members) {
      if (m.user_id && !seen.has(m.user_id)) {
        revalidateTag(tags.userCrews(m.user_id), "max");
        seen.add(m.user_id);
      }
    }
  }
  for (const uid of extraUserIds) {
    if (!seen.has(uid)) {
      revalidateTag(tags.userCrews(uid), "max");
      seen.add(uid);
    }
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
