import { format, parseISO } from "date-fns";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getProfileSummary,
  getGym,
  getCurrentSet,
  getRoutesBySet,
  getLeaderboardUserRow,
  getAllSets,
} from "@/lib/data/queries";
import { ClimberStats } from "@/components/ClimberStats/ClimberStats";
import {
  flashRate,
  pointsPerSend,
  completionRate,
  computeSetStreak,
} from "@/lib/data/profile-stats";

interface Props {
  userId: string;
  gymId: string;
  /**
   * profileUser.created_at — used by getAllSets to scope the streak
   * calculation to sets that overlapped the climber's tenure.
   */
  createdAt: string;
}

export async function ProfileStats({ userId, gymId, createdAt }: Props) {
  const supabase = await createServerSupabase();

  const [summary, activeSet, gym] = await Promise.all([
    getProfileSummary(supabase, userId, gymId),
    getCurrentSet(gymId),
    getGym(gymId),
  ]);

  // All-time totals come from per-set aggregates (sums across user_set_stats
  // rows for this gym). totalAttempts + uniqueRoutesAttempted are direct
  // RPC fields populated by migration 038.
  const totals = summary.per_set.reduce(
    (acc, s) => {
      acc.sends += s.sends;
      acc.flashes += s.flashes;
      acc.points += s.points;
      return acc;
    },
    { sends: 0, flashes: 0, points: 0 },
  );

  // Streak needs a newest-first list of sets with hasSend booleans. Each
  // user_set_stats row implies hasSend=true (rows are deleted when fully
  // empty by the trigger in migration 013), so per_set membership ≈
  // hasSend=true. We still need set ordering — only an active or recent
  // set might be missing from per_set if the climber hasn't sent there
  // yet. For streak purposes "current set with no sends" should count
  // as a break, so we use createdAt-scoped allSets ordering instead.
  // Cheap enough: getAllSets is server-cached (gym:{id}:active-set tag).
  const orderedSets = await getAllSets(gymId, createdAt);
  const sentSetIds = new Set(summary.per_set.map((s) => s.set_id));
  const streak = computeSetStreak(
    orderedSets.map((s) => ({ hasSend: sentSetIds.has(s.id) })),
  );

  const allTimeExtras = {
    flashRate: flashRate(totals.sends, totals.flashes),
    pointsPerSend: pointsPerSend(totals.points, totals.sends),
    totalAttempts: summary.total_attempts,
    completionRate: completionRate(totals.sends, summary.unique_routes_attempted),
    uniqueRoutesAttempted: summary.unique_routes_attempted,
    totalRoutesInGym: summary.total_routes_in_gym,
    streakCurrent: streak.current,
    streakBest: streak.best,
  };

  const routes = activeSet ? await getRoutesBySet(activeSet.id) : [];

  // Active-set rank for the rank chip on the current-set card. Only
  // worth fetching if there's an active set to rank against.
  const rankRow = activeSet
    ? await getLeaderboardUserRow(supabase, gymId, userId, activeSet.id)
    : null;

  const activeSetStats = activeSet
    ? summary.per_set.find((s) => s.set_id === activeSet.id) ?? {
        sends: 0,
        flashes: 0,
        points: 0,
        zones: 0,
        set_id: activeSet.id,
      }
    : null;

  const currentSet = activeSet && activeSetStats
    ? {
        completions: activeSetStats.sends,
        flashes: activeSetStats.flashes,
        points: activeSetStats.points,
        totalRoutes: routes.length,
        resetDate: format(parseISO(activeSet.ends_at), "MMM d"),
        rank: rankRow?.rank ?? null,
      }
    : null;

  // SendGridTile mini-grid wants a Map<route_id, log>. Build it from
  // active_set_detail; routes that the climber hasn't logged yield no
  // entry so SendGridTile renders the empty state.
  const logsByRoute = new Map(
    summary.active_set_detail.map((d) => [
      d.route_id,
      {
        attempts: d.attempts,
        completed: d.completed,
        zone: d.zone,
        route_id: d.route_id,
        // ClimberStats only reads attempts/completed/zone for tile
        // rendering; the unused fields stay default to satisfy the
        // RouteLog shape without a hand-rolled stub.
        id: "",
        user_id: userId,
        gym_id: gymId,
        completed_at: null,
        grade_vote: null,
        created_at: "",
        updated_at: "",
      },
    ]),
  );

  return (
    <ClimberStats
      currentSet={currentSet}
      allTimeCompletions={totals.sends}
      allTimeFlashes={totals.flashes}
      allTimePoints={totals.points}
      allTimeExtras={allTimeExtras}
      gymName={gym?.name}
      routeIds={routes.length > 0 ? routes.map((r) => r.id) : undefined}
      routeHasZone={routes.length > 0 ? routes.map((r) => r.has_zone) : undefined}
      routeNumbers={routes.length > 0 ? routes.map((r) => r.number) : undefined}
      logs={routes.length > 0 ? logsByRoute : undefined}
    />
  );
}
