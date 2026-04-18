import "server-only";

import { cache } from "react";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import type {
  CompetitionSummary,
  CompetitionGymLink,
  CompetitionCategory,
} from "./competition-queries";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { tags } from "@/lib/cache/tags";
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
          logger.warn("getcompetitionbyid_failed", { err: formatErrorForLog(error) });
          return null;
        }
        return (data as CompetitionSummary | null) ?? null;
      },
      { tags: [tags.competition(competitionId)], revalidate: 300 },
    );
    return fn(competitionId);
  },
);

/**
 * Gyms linked to a competition. Cached — same `competition:{id}` tag
 * as the row itself so any organiser link/unlink mutation invalidates.
 * Shared across every climber + admin viewing this competition.
 */
export const getCompetitionGymsCached = cache(
  async (competitionId: string): Promise<CompetitionGymLink[]> => {
    const fn = cachedQuery(
      ["competition-gyms", competitionId],
      async (id: string): Promise<CompetitionGymLink[]> => {
        const supabase = createCachedContextClient();
        const { data, error } = await supabase
          .from("competition_gyms")
          .select("competition_id, gym_id, gyms:gym_id (name, slug)")
          .eq("competition_id", id);
        if (error) {
          logger.warn("getcompetitiongymscached_failed", { err: formatErrorForLog(error) });
          return [];
        }
        return (data ?? []).flatMap((row) => {
          const gym = Array.isArray(row.gyms) ? row.gyms[0] : row.gyms;
          if (!gym) return [];
          return [{
            competition_id: row.competition_id,
            gym_id: row.gym_id,
            gym_name: gym.name,
            gym_slug: gym.slug,
          }];
        });
      },
      { tags: [tags.competition(competitionId)], revalidate: 300 },
    );
    return fn(competitionId);
  },
);

/**
 * Categories for a competition, ordered as the organiser arranged them.
 * Cached on the same competition tag — categoy add/remove mutations
 * already revalidate it (admin actions in mig 037 work).
 */
export const getCompetitionCategoriesCached = cache(
  async (competitionId: string): Promise<CompetitionCategory[]> => {
    const fn = cachedQuery(
      ["competition-categories", competitionId],
      async (id: string): Promise<CompetitionCategory[]> => {
        const supabase = createCachedContextClient();
        const { data, error } = await supabase
          .from("competition_categories")
          .select("id, competition_id, name, display_order")
          .eq("competition_id", id)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });
        if (error) {
          logger.warn("getcompetitioncategoriescached_failed", { err: formatErrorForLog(error) });
          return [];
        }
        return (data ?? []) as CompetitionCategory[];
      },
      { tags: [tags.competition(competitionId)], revalidate: 300 },
    );
    return fn(competitionId);
  },
);
