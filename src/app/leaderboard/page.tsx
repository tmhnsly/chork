import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import {
  getGym,
  getCurrentSet,
  getLeaderboard,
  getLeaderboardNeighbourhood,
  getLeaderboardUserRow,
  getGymStats,
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

  const [gym, currentSet, allTimeStats] = await Promise.all([
    getGym(supabase, gymId),
    getCurrentSet(supabase, gymId),
    getGymStats(supabase, gymId),
  ]);

  // Determine initial tab's setId — prefer active set, fall back to all-time
  const initialSetId = currentSet?.id ?? null;

  const [top, userRow, setStats] = await Promise.all([
    getLeaderboard(supabase, gymId, initialSetId, TOP_LIMIT, 0),
    getLeaderboardUserRow(supabase, gymId, userId, initialSetId),
    initialSetId ? getGymStats(supabase, gymId, initialSetId) : Promise.resolve(null),
  ]);

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
      />
    </main>
  );
}
