import { cache } from "react";
import { getLeaderboardUserRow } from "@/lib/data/leaderboard-queries";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Per-request dedupe for the climber's rank on the active set — the
 * hero's rank chip and ProfileStats' rank cell both want it in the
 * same render, and the per-user RPC is deliberately uncached at the
 * data layer (layer 2 is for shared reads; a rank is per-climber).
 * React `cache()` collapses the two calls into one RPC per request:
 * `createServerSupabase` is itself request-cached, so the client
 * argument is referentially stable and the memo key holds.
 */
export const getUserRankCached = cache(
  async (
    supabase: SupabaseClient<Database>,
    gymId: string,
    userId: string,
    setId: string,
  ) => getLeaderboardUserRow(supabase, gymId, userId, setId),
);
