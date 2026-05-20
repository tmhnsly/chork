import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";

type Supabase = SupabaseClient<Database>;

/** Return a Map of badge_id → earned_at ISO for the given user. */
export async function getEarnedAchievements(
  supabase: Supabase,
  userId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("user_achievements")
    .select("badge_id, earned_at")
    .eq("user_id", userId);

  if (error) {
    logger.warn("getearnedachievements_failed", { err: formatErrorForLog(error) });
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.badge_id, r.earned_at]));
}
