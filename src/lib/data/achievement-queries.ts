import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

import { readMany } from "./read";

type Supabase = SupabaseClient<Database>;

/** Return a Map of badge_id → earned_at ISO for the given user. */
export async function getEarnedAchievements(
  supabase: Supabase,
  userId: string
): Promise<Map<string, string>> {
  const rows = await readMany<{ badge_id: string; earned_at: string }>(
    supabase
      .from("user_achievements")
      .select("badge_id, earned_at")
      .eq("user_id", userId),
    "getearnedachievements_failed",
  );
  return new Map(rows.map((r) => [r.badge_id, r.earned_at]));
}

/**
 * When the climber last moved each achievement ladder.
 *
 * The shelf ranks by RECENCY of activity — recently earned, recently
 * contributed towards — not by proximity to a target. Progress is a
 * count with no timestamp, so this is derived: the last flash, the
 * last send (which also moves points), and the last finished match.
 * Six progress keys collapse to those three dates.
 */
export interface AchievementActivity {
  last_flash_at: string | null;
  last_send_at: string | null;
  last_match_at: string | null;
}

export async function getAchievementActivity(
  supabase: Supabase,
  userId: string,
): Promise<AchievementActivity> {
  const { data, error } = await supabase
    .rpc("get_achievement_activity", { p_user_id: userId })
    .maybeSingle();
  if (error || !data) {
    return { last_flash_at: null, last_send_at: null, last_match_at: null };
  }
  return data as AchievementActivity;
}
