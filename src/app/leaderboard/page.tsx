import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { requireAuth } from "@/lib/auth";
import {
  getGym,
  getCurrentSet,
  getLeaderboardCached,
  getLeaderboardNeighbourhood,
  getLeaderboardUserRow,
  getGymStatsV2Cached,
  getRoutesBySet,
} from "@/lib/data/queries";
import { LeaderboardView } from "@/components/Leaderboard/LeaderboardView";
import styles from "./leaderboard.module.scss";

export const metadata = {
  title: "Chorkboard - Chork",
};

const TOP_LIMIT = 5;

export default async function LeaderboardPage() {
  const auth = await requireAuth();
  if ("error" in auth) redirect("/login");
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
  const [top, userRow, stats, currentSetRoutes] = await Promise.all([
    getLeaderboardCached(gymId, initialSetId, TOP_LIMIT, 0),
    getLeaderboardUserRow(supabase, gymId, userId, initialSetId),
    getGymStatsV2Cached(gymId, initialSetId),
    initialSetId ? getRoutesBySet(initialSetId) : Promise.resolve([]),
  ]);

  const allTimeStats = stats.all_time;
  const setStats = stats.set;

  const needsNeighbourhood =
    userRow !== null && userRow.rank !== null && userRow.rank > TOP_LIMIT;

  const neighbourhood = needsNeighbourhood
    ? await getLeaderboardNeighbourhood(supabase, gymId, userId, initialSetId)
    : [];

  return (
    <main className={styles.page}>
      <LeaderboardView
        gymName={gym?.name ?? "Your gym"}
        currentSetId={currentSet?.id ?? null}
        currentUserId={userId}
        initialSetData={{ top, userRow, neighbourhood }}
        setStats={setStats}
        allTimeStats={allTimeStats}
        currentSetRoutes={currentSetRoutes}
        currentSetResetDate={
          currentSet ? format(parseISO(currentSet.ends_at), "MMM d") : null
        }
      />
    </main>
  );
}
