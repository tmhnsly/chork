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
  // requireAuth fails if the user isn't signed in OR is signed in
  // without an active gym. Gymless users land on /jam rather than
  // being bounced to /login — the gym-scoped leaderboard has no
  // meaning without a gym, and /jam is the useful home for them.
  if ("error" in auth) {
    redirect(auth.error === "No gym selected" ? "/jam" : "/login");
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
  // Neighbourhood runs unconditionally in the same parallel wave.
  // Previously it waited on userRow.rank > TOP_LIMIT before firing,
  // which added 50–100 ms of serial latency for mid-ranked viewers.
  // For top-N viewers the RPC result is thrown away by
  // LeaderboardView's existing dedup (line 142) — ~5 rows wasted,
  // no user-facing cost.
  const [top, userRow, stats, currentSetRoutes, neighbourhood] =
    await Promise.all([
      getLeaderboardCached(gymId, initialSetId, TOP_LIMIT, 0),
      getLeaderboardUserRow(supabase, gymId, userId, initialSetId),
      getGymStatsV2Cached(gymId, initialSetId),
      initialSetId ? getRoutesBySet(initialSetId) : Promise.resolve([]),
      getLeaderboardNeighbourhood(supabase, gymId, userId, initialSetId),
    ]);

  const allTimeStats = stats.all_time;
  const setStats = stats.set;

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
