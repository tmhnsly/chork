import "server-only";

import { cache } from "react";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import type { RouteSet } from "./types";

import { tags } from "@/lib/cache/tags";
import { readMany, readSingle } from "./read";

export function getCurrentSet(gymId: string): Promise<RouteSet | null> {
  const fn = cachedQuery(
    ["set-active", gymId],
    async (id: string): Promise<RouteSet | null> => {
      const supabase = createCachedContextClient();
      // Filter by `status = 'live'` rather than the trigger-derived
      // legacy `active` column. CLAUDE.md: "New code writes `status`;
      // old readers of `active` still work. Prefer `status` in new
      // code." Migration 058 added `sets_status_live_idx (gym_id)
      // WHERE status = 'live'` — perfect partial-index hit.
      return readSingle<RouteSet>(
        supabase
          .from("sets")
          .select("*")
          .eq("gym_id", id)
          .eq("status", "live")
          .limit(1)
          .maybeSingle(),
        "getcurrentset_failed",
      );
    },
    { tags: [tags.gymActiveSet(gymId)], revalidate: 60 },
  );
  return fn(gymId);
}

/**
 * Returns the 200 most recent sets for a gym. Callers that want to
 * scope by "sets that overlapped the user's tenure" should pass the
 * profile's `created_at` — the filter runs in-memory on the 200-row
 * result, not in SQL. Keeping `sinceIso` out of the cache key was a
 * deliberate trade: previously every unique user-creation-date
 * spawned its own cache entry, collapsing hit rate to ~1:1 as the
 * user base grew. Now the entry is scoped to the gym alone, so every
 * climber at the same gym shares the cache. Filtering 200 rows is
 * trivial JS cost; re-fetching per user was the real bill.
 */
// Wrapped in React.cache() so the three streamed profile sections
// (ProfileStats, ProfileAchievementsSection, PreviousSetsSection)
// share one promise within the render. unstable_cache dedupes at the
// data layer; React.cache adds the per-render dedupe so the call
// resolves once even if multiple siblings await it concurrently.
export const getAllSets = cache(
  async (gymId: string, sinceIso?: string): Promise<RouteSet[]> => {
    const fn = cachedQuery(
      ["sets", gymId],
      async (id: string): Promise<RouteSet[]> => {
        const supabase = createCachedContextClient();
        return readMany<RouteSet>(
          supabase
            .from("sets")
            .select("*")
            .eq("gym_id", id)
            .order("starts_at", { ascending: false })
            // Ceiling-guard. Profile streak + history surfaces show the
            // 200 most recent sets overlapping the user's tenure; older
            // history is archive-only and would otherwise pull the whole
            // gym's set history on every render. At 200 a long-running
            // gym (weekly resets for 4 years = ~210 sets) has one set
            // clipped; past that, callers paginate explicitly.
            .limit(200),
          "getallsets_failed",
        );
      },
      { tags: [tags.gymActiveSet(gymId)], revalidate: 300 },
    );
    const all = await fn(gymId);
    // In-memory filter — callers pass their profile's `created_at` to
    // hide sets that finished before they joined. Filter runs on the
    // capped 200-row result so it's a few-microseconds linear scan.
    return sinceIso ? all.filter((s) => s.ends_at >= sinceIso) : all;
  },
);
