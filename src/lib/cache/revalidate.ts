import "server-only";

import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { tags } from "@/lib/cache/tags";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
type Supabase = SupabaseClient<Database>;

/**
 * Bust the by-username profile cache for a user.
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
 * revalidateTag directly with the captured old + new usernames instead.
 */
export async function revalidateUserProfile(
  supabase: Supabase,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // Don't silently leave the by-username cache stale on a transient
    // failure — log it so the only evidence isn't a stale /u page.
    logger.warn("revalidate_user_profile_username_lookup_failed", {
      err: formatErrorForLog(error),
    });
  }
  if (data?.username) {
    revalidateTag(tags.userByUsername(data.username), "max");
  }
}

/**
 * Bust the tags that any route-log write affects.
 *
 * Today that is the set leaderboard alone (`setId` is nullable because
 * route_logs.set_id can occasionally be null — route fetched without
 * its parent set joined; the helper owns the conditional so callers
 * don't repeat the `if (setId)` guard at every site).
 *
 * This helper is the seam where a per-user stats cache would hook in:
 * a `user:{uid}:stats` bust lived here until 2026-08, but no cached
 * read ever carried that tag, so it was retired as a no-op. If
 * per-user stats gain a `cachedQuery` reader, re-add the tag HERE so
 * every route-log mutation picks it up in one edit — that coupling is
 * the reason this stays a named helper rather than an inline bust
 * (see ADR 0004).
 */
export function revalidateRouteLogTags(
  setId: string | null,
  _userId: string,
): void {
  if (setId) revalidateTag(tags.setLeaderboard(setId), "max");
}
