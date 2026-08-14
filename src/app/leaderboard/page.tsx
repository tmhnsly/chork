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
import styles from "./leaderboard.module.scss";

export const metadata = {
  title: "Chorkboard - Chork",
};

export default async function LeaderboardPage() {
  const auth = await requireAuth();
  // requireAuth fails if the user isn't signed in OR is signed in
  // without an active gym. Gymless users land on /jam rather than
  // being bounced to /login — the gym-scoped leaderboard has no
  // meaning without a gym, and /jam is the useful home for them.
  if ("error" in auth) {
    redirect(isNoGymError(auth.error) ? "/jam" : "/login");
  }
  const { supabase, userId, gymId } = auth;

  const [gym, currentSet] = await Promise.all([
    getGym(gymId),
    getCurrentSet(gymId),
  ]);

  // Determine initial tab's setId — prefer active set, fall back to all-time
  const initialSetId = currentSet?.id ?? null;

  // Cached helpers serve from unstable_cache (shared across viewers
  // — N concurrent users cost 1 DB compute per mutation, not N).
  // Page-level membership is enforced by requireAuth above:
  // gymId == profile.active_gym_id, which is set during onboarding +
  // every gym switch. The cached RPCs are granted to service_role
  // only (mig 039) — they can't be hit directly from the browser.
  // userRow / neighbourhood stay per-user (uncached) since they
  // depend on the caller's identity.
  //
  // The tab triple (top / userRow / neighbourhood) is assembled by
  // getLeaderboardTabData — the same rule fetchLeaderboardTab uses
  // on tab switches, so first paint and tab switch can't drift.
  const [tabData, stats, currentSetRoutes] = await Promise.all([
    getLeaderboardTabData(supabase, gymId, userId, initialSetId),
    getGymStatsV2Cached(gymId, initialSetId),
    initialSetId ? getRoutesBySet(initialSetId) : Promise.resolve([]),
  ]);

  const allTimeStats = stats.all_time;
  const setStats = stats.set;

  return (
    <main className={styles.page}>
      <LeaderboardView
        gymName={gym?.name ?? "Your gym"}
        currentSetId={currentSet?.id ?? null}
        currentUserId={userId}
        initialSetData={tabData}
        setStats={setStats}
        allTimeStats={allTimeStats}
        currentSetRoutes={currentSetRoutes}
        currentSetResetIn={
          currentSet ? formatSetResetCountdown(currentSet.ends_at) : null
        }
      />
    </main>
  );
}
