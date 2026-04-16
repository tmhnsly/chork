import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { requireAuth } from "@/lib/auth";
import {
  getGym,
  getCurrentSet,
  getLeaderboard,
  getLeaderboardNeighbourhood,
  getLeaderboardUserRow,
  getGymStatsV2,
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

  // One RPC returns both all-time + set-scoped stats; replaces the
  // prior two-call pattern that fired 8 Supabase queries per paint.
  const [top, userRow, stats, currentSetRoutes] = await Promise.all([
    getLeaderboard(supabase, gymId, initialSetId, TOP_LIMIT, 0),
    getLeaderboardUserRow(supabase, gymId, userId, initialSetId),
    getGymStatsV2(supabase, gymId, initialSetId),
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
