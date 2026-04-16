/**
 * Evaluate badges for a user, persist any newly-earned ones, and
 * return the diff (badges earned for the FIRST time on this call).
 *
 * Called from the `completeRoute` server action after a successful
 * upsert. The returned list is threaded into the action's response
 * so the client can fire a celebratory toast for each — without it,
 * achievement awards would feel disconnected from the send that
 * triggered them.
 *
 * Intentionally never throws — achievement writes must not break
 * the logging flow. Errors are logged and an empty array returned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  evaluateBadges,
  type BadgeContext,
  type BadgeDefinition,
} from "@/lib/badges";

type Supabase = SupabaseClient<Database>;

export async function evaluateAndPersistAchievements(
  supabase: Supabase,
  userId: string,
  ctx: BadgeContext
): Promise<BadgeDefinition[]> {
  try {
    const statuses = evaluateBadges(ctx);
    const earned = statuses.filter((s) => s.earned).map((s) => s.badge);
    if (earned.length === 0) return [];

    // Pre-fetch the climber's already-earned set so we can compute
    // the diff. One indexed query keyed by (user_id) — cheap.
    const { data: existingRows, error: selectError } = await supabase
      .from("user_achievements")
      .select("badge_id")
      .eq("user_id", userId);

    if (selectError) {
      console.error("[achievements] existing-row fetch failed", selectError);
      return [];
    }

    const existingIds = new Set((existingRows ?? []).map((r) => r.badge_id));
    const newlyEarned = earned.filter((b) => !existingIds.has(b.id));
    if (newlyEarned.length === 0) return [];

    const rows = newlyEarned.map((b) => ({ user_id: userId, badge_id: b.id }));

    // Upsert ignoring conflicts — defence-in-depth in case a parallel
    // request slipped a row in between our SELECT and INSERT. Existing
    // (user_id, badge_id) rows keep their original earned_at, so the
    // timestamp reflects FIRST earn, not latest.
    const { error: upsertError } = await supabase
      .from("user_achievements")
      .upsert(rows, { onConflict: "user_id,badge_id", ignoreDuplicates: true });

    if (upsertError) {
      console.error("[achievements] persist failed", upsertError);
      return [];
    }

    return newlyEarned;
  } catch (err) {
    console.error("[achievements] evaluate/persist threw", err);
    return [];
  }
}
