import { redirect } from "next/navigation";
import { formatSetResetCountdown } from "@/lib/data/set-label";
import { requireAuth } from "@/lib/auth";
import { isNoGymError } from "@/lib/auth-errors";
import { getGym } from "@/lib/data/gym-queries";
import { getCurrentSet } from "@/lib/data/set-queries";
import { getRoutesBySet } from "@/lib/data/route-queries";
import {
  getLeaderboardTabData,
  getGymStatsV2Cached,
} from "@/lib/data/leaderboard-queries";
import { LeaderboardView } from "@/components/Leaderboard/LeaderboardView";

/**
 * The Chorkboard's data half, streamed behind the page's shell.
 *
 * Cached helpers serve from unstable_cache (shared across viewers —
 * N concurrent users cost 1 DB compute per mutation, not N).
 * Page-level membership is enforced by requireAuth: gymId ==
 * profile.active_gym_id, set during onboarding + every gym switch.
 * The cached RPCs are granted to service_role only (mig 039) — they
 * can't be hit from the browser. userRow / neighbourhood stay
 * per-user (uncached) since they depend on the caller.
 *
 * The tab triple (top / userRow / neighbourhood) is assembled by
 * getLeaderboardTabData — the same rule fetchLeaderboardTab uses on
 * tab switches, so first paint and tab switch can't drift.
 */
export async function LeaderboardContent() {
  const auth = await requireAuth();
  if ("error" in auth) redirect(isNoGymError(auth.error) ? "/match" : "/login");
  const { supabase, userId, gymId } = auth;

  const [gym, currentSet] = await Promise.all([getGym(gymId), getCurrentSet(gymId)]);
  const initialSetId = currentSet?.id ?? null;
  const [tabData, stats, currentSetRoutes] = await Promise.all([
    getLeaderboardTabData(supabase, gymId, userId, initialSetId),
    getGymStatsV2Cached(gymId, initialSetId),
    initialSetId ? getRoutesBySet(initialSetId) : Promise.resolve([]),
  ]);

  return (
    <LeaderboardView
      gymName={gym?.name ?? "Your gym"}
      currentSetId={currentSet?.id ?? null}
      currentUserId={userId}
      initialSetData={tabData}
      setStats={stats.set}
      allTimeStats={stats.all_time}
      currentSetRoutes={currentSetRoutes}
      currentSetResetIn={currentSet ? formatSetResetCountdown(currentSet.ends_at) : null}
    />
  );
}
