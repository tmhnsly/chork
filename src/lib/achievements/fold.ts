import { isFlash } from "@/lib/data/logs";

/**
 * The pure half of badge-context building: turn a gym's sets, their
 * routes, and one climber's logs into the per-set Maps the badge
 * evaluator reads.
 *
 * Lives apart from `context.ts` because that module's five awaits
 * (sets, routes, logs, aggregates, jam context) made the interesting
 * part — this fold — reachable only by mocking five modules, so it
 * had no tests at all. Nothing here imports Supabase or `server-only`;
 * it's data in, data out.
 */

export interface GymSetFold {
  completedRoutesBySet: Map<string, Set<number>>;
  totalRoutesBySet: Map<string, number>;
  flashedRoutesBySet: Map<string, Set<number>>;
  zoneAvailableBySet: Map<string, Set<number>>;
  zoneClaimedBySet: Map<string, Set<number>>;
}

/** Structural shapes — deliberately narrower than the row types, so
 *  the fold can be exercised without constructing full DB rows. */
export interface FoldSet {
  id: string;
}
export interface FoldRoute {
  id: string;
  number: number;
  has_zone: boolean;
}
export interface FoldLog {
  set_id: string | null;
  route_id: string;
  attempts: number;
  completed: boolean;
  zone: boolean;
}

/** Empty gym-scoped shape — used when the climber has no active gym
 *  (jam-only) so the evaluator can run on jam data without a
 *  null-guard on every Map access. */
export function emptyGymFold(): GymSetFold {
  return {
    completedRoutesBySet: new Map(),
    totalRoutesBySet: new Map(),
    flashedRoutesBySet: new Map(),
    zoneAvailableBySet: new Map(),
    zoneClaimedBySet: new Map(),
  };
}

export function foldGymSets(
  sets: FoldSet[],
  routesBySetId: Map<string, FoldRoute[]>,
  logs: FoldLog[],
): GymSetFold {
  const fold = emptyGymFold();

  // Pre-bucket logs by set_id so we don't re-scan the full log list
  // inside the per-set loop below. Before: O(sets × logs) — a climber
  // with, say, 40 sets and 600 lifetime logs was scanning 24k entries
  // on every badge eval. After: O(sets + logs).
  const logsBySet = new Map<string, FoldLog[]>();
  for (const log of logs) {
    if (!log.set_id) continue;
    const bucket = logsBySet.get(log.set_id);
    if (bucket) bucket.push(log);
    else logsBySet.set(log.set_id, [log]);
  }

  for (const set of sets) {
    const routes = routesBySetId.get(set.id) ?? [];
    fold.totalRoutesBySet.set(set.id, routes.length);
    const routeNumberById = new Map(routes.map((r) => [r.id, r.number]));

    // Zone availability is a property of the routes themselves —
    // compute it per set whether or not the climber's logs touch them,
    // or a set nobody has climbed reports "no zones available" and
    // the all-zones badges become unreachable.
    const zoneAvailable = new Set<number>();
    for (const r of routes) {
      if (r.has_zone) zoneAvailable.add(r.number);
    }
    fold.zoneAvailableBySet.set(set.id, zoneAvailable);

    const completed = new Set<number>();
    const flashed = new Set<number>();
    const zoneClaimed = new Set<number>();
    for (const log of logsBySet.get(set.id) ?? []) {
      // A log whose route isn't in this set's route list is skipped:
      // routes can be deleted while their logs survive.
      const num = routeNumberById.get(log.route_id);
      if (num === undefined) continue;
      if (log.zone) zoneClaimed.add(num);
      if (!log.completed) continue;
      completed.add(num);
      // Flash is derived, never a stored flag — see CONTEXT.md.
      if (isFlash(log)) flashed.add(num);
    }
    fold.completedRoutesBySet.set(set.id, completed);
    fold.flashedRoutesBySet.set(set.id, flashed);
    fold.zoneClaimedBySet.set(set.id, zoneClaimed);
  }

  return fold;
}
