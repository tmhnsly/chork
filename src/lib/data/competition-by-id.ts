import "server-only";

import { cache } from "react";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import type { CompetitionSummary } from "./competition-queries";

/**
 * Single competition by id. Server-only — lives here (not in
 * competition-queries.ts) so the cached-context client chain doesn't
 * get pulled into client bundles via CompetitionLeaderboard.
 *
 * Null when the row doesn't exist or when RLS hides it. Composed
 * caching: outer React cache() dedupes per render, inner
 * unstable_cache shares across renders with tag competition:{id}.
 */
export const getCompetitionById = cache(
  async (competitionId: string): Promise<CompetitionSummary | null> => {
    const fn = cachedQuery(
      ["competition", competitionId],
      async (id: string): Promise<CompetitionSummary | null> => {
        const supabase = createCachedContextClient();
        const { data, error } = await supabase
          .from("competitions")
          .select("id, name, description, starts_at, ends_at, status, organiser_id")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.warn("[chork] getCompetitionById failed:", error);
          return null;
        }
        return (data as CompetitionSummary | null) ?? null;
      },
      { tags: [`competition:${competitionId}`], revalidate: 300 },
    );
    return fn(competitionId);
  },
);
