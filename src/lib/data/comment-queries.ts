import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import type { Comment, PaginatedComments } from "./types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { tags } from "@/lib/cache/tags";
import { readMany } from "./read";

type Supabase = SupabaseClient<Database>;

/**
 * Comments attached to a route, paginated. Cached — comments are
 * gym-scoped (route → set → gym) so every member of the gym that
 * owns the route sees the same result; cross-user cache sharing is
 * correct. Mutations (`postComment`, `editComment`) bust the
 * `route:{id}:comments` tag in `src/app/(app)/actions.ts`, so the
 * cache never serves stale content past a write.
 *
 * Dropped the `supabase` arg — cached reads run through the
 * service-role-backed `createCachedContextClient` so the entry is
 * shared across viewers. Authorisation already happens at the page
 * level (caller can only reach this function via a route they're
 * allowed to open), and the returned payload doesn't include any
 * auth-variant fields.
 */
export function getCommentsByRoute(
  routeId: string,
  page: number = 1,
  perPage: number = 20,
): Promise<PaginatedComments> {
  const fn = cachedQuery(
    ["comments-by-route", routeId, String(page), String(perPage)],
    async (
      rId: string,
      p: number,
      per: number,
    ): Promise<PaginatedComments> => {
      const supabase = createCachedContextClient();
      const from = (p - 1) * per;
      const to = from + per - 1;

      // Single query: fetch data + exact count in one round trip.
      const { data, count, error } = await supabase
        .from("comments")
        .select("*, profiles(id, username, name, avatar_url)", { count: "exact" })
        .eq("route_id", rId)
        .order("likes", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        logger.warn("getcommentsbyroute_failed", { err: formatErrorForLog(error) });
      }

      const totalItems = count ?? 0;
      return {
        items: (data ?? []) as Comment[],
        totalItems,
        totalPages: Math.ceil(totalItems / per),
        page: p,
      };
    },
    { tags: [tags.routeComments(routeId)], revalidate: 60 },
  );
  return fn(routeId, page, perPage);
}

export async function getLikedCommentIds(
  supabase: Supabase,
  userId: string,
  routeId: string
): Promise<Set<string>> {
  const rows = await readMany<{ comment_id: string }>(
    supabase
      .from("comment_likes")
      .select("comment_id, comments!inner(route_id)")
      .eq("user_id", userId)
      .eq("comments.route_id", routeId),
    "getlikedcommentids_failed",
  );
  return new Set(rows.map((r) => r.comment_id));
}
