import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

import { readMany } from "./read";

type Supabase = SupabaseClient<Database>;

/**
 * badge_id → the DAY it was earned (`YYYY-MM-DD`), for any climber.
 *
 * Reads through `get_earned_achievements` (migration 132), not the
 * table: `user_achievements` is own-rows-only now, and the RPC hands
 * everyone else the day rather than the clock time. A badge is earned
 * by a send, so `earned_at` IS a send time, and the day is the grain
 * this app publishes about when someone was on the wall. The detail
 * sheet only ever showed the day, so nothing visible changed.
 */
export async function getEarnedAchievements(
  supabase: Supabase,
  userId: string,
): Promise<Map<string, string>> {
  const rows = await readMany<{ badge_id: string; earned_on: string }>(
    supabase.rpc("get_earned_achievements", { p_user_id: userId }),
    "getearnedachievements_failed",
  );
  return new Map(rows.map((r) => [r.badge_id, r.earned_on]));
}

/**
 * When the CALLER last moved each achievement ladder — as days.
 *
 * The shelf ranks by RECENCY of activity — recently earned, recently
 * contributed towards — not by proximity to a target. Progress is a
 * count with no timestamp, so this is derived: the last flash, the
 * last send (which also moves points), and the last finished match.
 * Six progress keys collapse to those three dates.
 *
 * Self-only by construction (migration 132 — the RPC takes no uid),
 * and days rather than times: a day is all the ranking needs, and it
 * is what may leave the database about when a climber climbed. The
 * profile only asks for it on the owner's own view.
 */
export interface AchievementActivity {
  last_flash_on: string | null;
  last_send_on: string | null;
  last_match_on: string | null;
}

export async function getAchievementActivity(supabase: Supabase): Promise<AchievementActivity> {
  const { data, error } = await supabase.rpc("get_achievement_activity").maybeSingle();
  if (error || !data) {
    return { last_flash_on: null, last_send_on: null, last_match_on: null };
  }
  return data as AchievementActivity;
}
