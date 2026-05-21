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
