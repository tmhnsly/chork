import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import type { Profile } from "./types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { tags } from "@/lib/cache/tags";
import { asJsonShape } from "./json-shape";
import { readSingle, readMany } from "./read";
import type { GradeDistributionRow } from "./grade-distribution";
import type { GradeProgressionRow } from "./grade-progression";

type Supabase = SupabaseClient<Database>;

export async function getProfile(supabase: Supabase, userId: string): Promise<Profile | null> {
  return readSingle<Profile>(
    supabase.from("profiles").select("*").eq("id", userId).single(),
    "getprofile_failed",
  );
}

export const getProfileByUsername = cache(
  async (username: string): Promise<Profile | null> => {
    const fn = cachedQuery(
      ["profile-by-username", username],
      async (u: string): Promise<Profile | null> => {
        const supabase = createCachedContextClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("username", u)
          .single();
        if (error) {
          logger.warn("getprofilebyusername_failed", { err: formatErrorForLog(error) });
          return null;
        }
        return data;
      },
      {
        // Tag must be known at wrap time; username is the only keyable
        // thing we have until the fetch resolves. On rename, updateProfile
        // revalidates both old and new username tags (Phase 3).
        tags: [tags.userByUsername(username)],
        revalidate: 300,
      },
    );
    return fn(username);
  },
);

// ── Profile summary (migration 036) ────────────────

export interface ProfileSummary {
  per_set: Array<{
    set_id: string;
    sends: number;
    flashes: number;
    zones: number;
    points: number;
  }>;
  active_set_detail: Array<{
    route_id: string;
    attempts: number;
    completed: boolean;
    zone: boolean;
  }>;
  total_routes_in_gym: number;
  total_attempts: number;
  unique_routes_attempted: number;
}

export const getProfileSummary = cache(
  async (
    supabase: Supabase,
    userId: string,
    gymId: string,
  ): Promise<ProfileSummary> => {
    const { data, error } = await supabase.rpc("get_profile_summary", {
      p_user_id: userId,
      p_gym_id: gymId,
    });
    if (error) {
      logger.warn("getprofilesummary_failed", { err: formatErrorForLog(error) });
      return {
        per_set: [],
        active_set_detail: [],
        total_routes_in_gym: 0,
        total_attempts: 0,
        unique_routes_attempted: 0,
      };
    }
    return data == null
      ? {
          per_set: [],
          active_set_detail: [],
          total_routes_in_gym: 0,
          total_attempts: 0,
          unique_routes_attempted: 0,
        }
      : asJsonShape<ProfileSummary>(data);
  },
);

/**
 * Grade distribution for the pyramid on a climber's profile
 * (migration 094). Service-role: the RPC takes its subject
 * explicitly, and the page has already resolved whose profile is
 * being viewed.
 *
 * Returns the raw rollup — `buildGradeDistribution` in
 * `grade-distribution.ts` shapes it, and is where the rules worth
 * testing live.
 */
export async function getGradeDistribution(
  service: Supabase,
  userId: string,
): Promise<GradeDistributionRow[]> {
  return readMany<GradeDistributionRow>(
    service.rpc("get_grade_distribution", { p_user_id: userId }),
    "getgradedistribution_failed",
  );
}

/**
 * Monthly best-grade rollup for the progression chart (migration
 * 135). Service-role for the same reason as the distribution above —
 * the RPC takes its subject as an argument, so the page decides whose
 * profile is being read. `grade-progression.ts` shapes it.
 */
export async function getGradeProgression(
  service: Supabase,
  userId: string,
): Promise<GradeProgressionRow[]> {
  return readMany<GradeProgressionRow>(
    service.rpc("get_grade_progression", { p_user_id: userId }),
    "getgradeprogression_failed",
  );
}
