import { format, parseISO } from "date-fns";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getAllSets,
  getRoutesBySet,
  getRoutesBySetIds,
  getAllRouteDataForUserInGym,
} from "@/lib/data/queries";
import type { Route } from "@/lib/data";
import { computeMaxPoints } from "@/lib/data";
import { evaluateBadgesForSet } from "@/lib/badges";
import { PreviousSetsGrid } from "@/components/sections/PreviousSetsGrid";
import type { SetCell, SetCellLog } from "@/components/sections/PreviousSetsGrid";

interface Props {
  userId: string;
  gymId: string;
  createdAt: string;
}

interface SetStats {
  completions: number;
  flashes: number;
  points: number;
  zones: number;
}

function formatSetLabel(starts: string, ends: string) {
  return [
    format(parseISO(starts), "MMM d").toUpperCase(),
    format(parseISO(ends), "MMM d").toUpperCase(),
  ].join(" – ");
}

export async function PreviousSetsSection({ userId, gymId, createdAt }: Props) {
  const supabase = await createServerSupabase();

  // Sets the climber could have touched. createdAt scopes out sets that
  // ended before they joined.
  const allSets = await getAllSets(gymId, createdAt);
  const activeSet = allSets.find((s) => s.active) ?? null;
  const previousSetRecords = allSets.filter((s) => !s.active);

  // Per-set badges need raw log info (which route numbers were
  // completed/flashed/zone-claimed) — kept on getAllRouteDataForUserInGym
  // because the new RPC only returns active-set raw detail. This component
  // streams under its own Suspense boundary so the heavier query doesn't
  // block the shell or the all-time stats card.
  const [activeRoutes, previousRoutesById, routeData] = await Promise.all([
    activeSet ? getRoutesBySet(activeSet.id) : Promise.resolve<Route[]>([]),
    getRoutesBySetIds(supabase, previousSetRecords.map((s) => s.id)),
    getAllRouteDataForUserInGym(supabase, gymId, userId, allSets.map((s) => s.id)),
  ]);

  // Per-set stats from the same raw logs (mirrors old page.tsx loop).
  const statsBySet = new Map<string, SetStats>();
  const logsBySet = new Map<string, typeof routeData.logs>();
  for (const log of routeData.logs) {
    const stats = statsBySet.get(log.set_id) ?? { completions: 0, flashes: 0, points: 0, zones: 0 };
    if (log.zone) {
      stats.zones++;
      stats.points += 1;
    }
    if (log.completed) {
      stats.completions++;
      if (log.attempts === 1) stats.flashes++;
      if (log.attempts === 1) stats.points += 4;
      else if (log.attempts === 2) stats.points += 3;
      else if (log.attempts === 3) stats.points += 2;
      else stats.points += 1;
    }
    statsBySet.set(log.set_id, stats);

    const arr = logsBySet.get(log.set_id) ?? [];
    arr.push(log);
    logsBySet.set(log.set_id, arr);
  }

  function buildSetCell(
    setRecord: { id: string; starts_at: string; ends_at: string },
    routes: Route[],
    isActive: boolean,
  ): SetCell {
    const stats = statsBySet.get(setRecord.id) ?? { completions: 0, flashes: 0, points: 0, zones: 0 };
    const setLogs = logsBySet.get(setRecord.id) ?? [];
    const logs: Map<string, SetCellLog> = new Map(
      setLogs.map((l) => [l.route_id, { attempts: l.attempts, completed: l.completed, zone: l.zone }]),
    );
    const totalRoutes = routes.length;
    const maxPoints = computeMaxPoints(totalRoutes, routes.filter((r) => r.has_zone).length);

    const completed = new Set<number>();
    const flashed = new Set<number>();
    const zoneClaimed = new Set<number>();
    const zoneAvailable = new Set<number>();
    for (const r of routes) if (r.has_zone) zoneAvailable.add(r.number);
    for (const log of setLogs) {
      const route = routes.find((r) => r.id === log.route_id);
      if (!route) continue;
      if (log.zone) zoneClaimed.add(route.number);
      if (!log.completed) continue;
      completed.add(route.number);
      if (log.attempts === 1) flashed.add(route.number);
    }
    const badgesForSet = evaluateBadgesForSet({
      completed,
      flashed,
      zoneAvailable,
      zoneClaimed,
      totalRoutes,
    });

    return {
      id: setRecord.id,
      label: formatSetLabel(setRecord.starts_at, setRecord.ends_at),
      isActive,
      hasActivity: stats.completions > 0 || setLogs.some((l) => l.attempts > 0),
      completions: stats.completions,
      flashes: stats.flashes,
      zones: stats.zones,
      points: stats.points,
      totalRoutes,
      maxPoints,
      routes,
      logs,
      badges: badgesForSet,
    };
  }

  const setCells: SetCell[] = [];
  if (activeSet) setCells.push(buildSetCell(activeSet, activeRoutes, true));
  for (const set of previousSetRecords) {
    const routes = previousRoutesById.get(set.id) ?? [];
    setCells.push(buildSetCell(set, routes, false));
  }

  const showSetsEmpty = activeSet !== null && previousSetRecords.length === 0;

  return (
    <PreviousSetsGrid
      sets={setCells}
      gymId={gymId}
      userId={userId}
      showEmptyState={showSetsEmpty}
    />
  );
}
