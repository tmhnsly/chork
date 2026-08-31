import { formatSetResetCountdown } from "@/lib/data/set-label";
import { createServerSupabase } from "@/lib/supabase/server";
import { getProfileSummary } from "@/lib/data/profile-queries";
import { getGym } from "@/lib/data/gym-queries";
import { getCurrentSet } from "@/lib/data/set-queries";
import { getRoutesBySet } from "@/lib/data/route-queries";
import { getUserRankCached } from "./user-rank";
import { visibleAttempts } from "@/lib/data/logs";
import { ClimberStats } from "@/components/ClimberStats/ClimberStats";
import {
} from "@/lib/data/profile-stats";

interface Props {
  userId: string;
  gymId: string;
  /**
   * Gates private stats (raw attempt counts). When false, `totalAttempts`
   * is nulled out before reaching the client so visitors never see it.
   */
  isOwnProfile: boolean;
}

export async function ProfileStats({ userId, gymId, isOwnProfile }: Props) {
  const supabase = await createServerSupabase();

  const [summary, activeSet, gym] = await Promise.all([
    getProfileSummary(supabase, userId, gymId),
    getCurrentSet(gymId),
    getGym(gymId),
  ]);

  // All-time totals come from per-set aggregates (sums across user_set_stats
  // rows for this gym). totalAttempts + uniqueRoutesAttempted are direct
  // RPC fields populated by migration 038.

  // Second wave — three independent fetches. Running these in parallel
  // shaves one round trip off the profile render; previously each await
  // blocked the next (orderedSets → routes → rankRow), turning a three-
  // query fan-out into a three-step waterfall.
  const [routes, rankRow] = await Promise.all([
    activeSet ? getRoutesBySet(activeSet.id) : Promise.resolve([]),
    activeSet
      ? getUserRankCached(supabase, gymId, userId, activeSet.id)
      : Promise.resolve(null),
  ]);

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
        resetIn: formatSetResetCountdown(activeSet.ends_at),
        rank: rankRow?.rank ?? null,
      }
    : null;

  // SendGridTile mini-grid wants a Map<route_id, log>. Build it from
  // active_set_detail; routes that the climber hasn't logged yield no
  // entry so SendGridTile renders the empty state. `visibleAttempts`
  // is the single source of truth for the owner-only-attempts rule.
  const logsByRoute = new Map(
    summary.active_set_detail.map((d) => [
      d.route_id,
      {
        attempts: visibleAttempts(d, isOwnProfile),
        completed: d.completed,
        zone: d.zone,
        route_id: d.route_id,
        // ClimberStats only reads attempts/completed/zone for tile
        // rendering; the unused fields stay default to satisfy the
        // RouteLog shape without a hand-rolled stub.
        id: "",
        user_id: userId,
        // Gym wall, so account-owned — a guest seat never appears on
        // a profile (migration 095).
        player_id: null,
        set_id: activeSet?.id ?? "",
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
      gymName={gym?.name}
      routeIds={routes.length > 0 ? routes.map((r) => r.id) : undefined}
      routeHasZone={routes.length > 0 ? routes.map((r) => r.has_zone) : undefined}
      routeNumbers={routes.length > 0 ? routes.map((r) => r.number) : undefined}
      logs={routes.length > 0 ? logsByRoute : undefined}
    />
  );
}
