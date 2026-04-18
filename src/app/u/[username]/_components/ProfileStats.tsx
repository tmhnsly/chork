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

  // Second wave — three independent fetches. Running these in parallel
  // shaves one round trip off the profile render; previously each await
  // blocked the next (orderedSets → routes → rankRow), turning a three-
  // query fan-out into a three-step waterfall.
  //
  // `getAllSets` feeds the streak calculation: per_set membership ≈
  // hasSend=true (migration 013's trigger deletes empty rows), but a
  // newer set the climber hasn't touched still has to count as a
  // break, so we reconcile the ordered set list against summary.per_set
  // below. Cheap enough — getAllSets is server-cached via the
  // `gym:{id}:active-set` tag.
  const [orderedSets, routes, rankRow] = await Promise.all([
    getAllSets(gymId, createdAt),
    activeSet ? getRoutesBySet(activeSet.id) : Promise.resolve([]),
    activeSet
      ? getLeaderboardUserRow(supabase, gymId, userId, activeSet.id)
      : Promise.resolve(null),
  ]);

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
