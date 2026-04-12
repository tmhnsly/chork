/**
 * Evaluate badges for a user and persist any newly-earned ones.
 *
 * Called from the `completeRoute` server action after a successful upsert.
 * Intentionally never throws — achievement writes must not break the logging
 * flow. Errors are logged and swallowed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { evaluateBadges, type BadgeContext } from "@/lib/badges";

type Supabase = SupabaseClient<Database>;

export async function evaluateAndPersistAchievements(
  supabase: Supabase,
  userId: string,
  ctx: BadgeContext
): Promise<void> {
  try {
    const statuses = evaluateBadges(ctx);
    const earnedIds = statuses.filter((s) => s.earned).map((s) => s.badge.id);
    if (earnedIds.length === 0) return;

    const rows = earnedIds.map((badge_id) => ({ user_id: userId, badge_id }));

    // Upsert ignoring conflicts — existing (user_id, badge_id) rows keep their
    // original earned_at, so the timestamp reflects FIRST earn, not latest.
    const { error } = await supabase
      .from("user_achievements")
      .upsert(rows, { onConflict: "user_id,badge_id", ignoreDuplicates: true });

    if (error) {
      console.error("[achievements] persist failed", error);
    }
  } catch (err) {
    console.error("[achievements] evaluate/persist threw", err);
  }
}
