"use client";

import { useState, useCallback, useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { RouteSet, Route, RouteLog } from "@/lib/data";
import { isFlash, computePoints, deriveTileState } from "@/lib/data";
import { formatGrade, type GradingScale } from "@/lib/data/grade-label";
import { StatsWidget } from "@/components/StatsWidget/StatsWidget";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { Legend } from "@/components/ui";
import dynamic from "next/dynamic";
import type { CachedRouteData } from "@/components/RouteLogSheet/RouteLogSheet";

const RouteLogSheet = dynamic(
  () => import("@/components/RouteLogSheet/RouteLogSheet").then((m) => m.RouteLogSheet),
  { ssr: false }
);
import styles from "./sendsGrid.module.scss";

interface Props {
  set: RouteSet;
  routes: Route[];
  initialLogs: RouteLog[];
  /** Current gym name — rendered under the title to match the Chorkboard header. */
  gymName?: string | null;
}

/**
 * Local-overlay state shape:
 *   - `key` is `set.id` so the overlay clears when the active set
 *     changes (admin publishes a new one). Within the same set's
 *     lifetime the overlay persists across server revalidations.
 *   - `map` holds optimistic + post-action updates by route id;
 *     server-truth from `initialLogs` is the base.
 *
 * Derived in render — no useEffect needed, satisfies
 * react-hooks/set-state-in-effect.
 */
interface OverlayState {
  key: string;
  map: Map<string, RouteLog>;
}

export function SendsGrid({ set, routes, initialLogs, gymName }: Props) {
  const [overlayState, setOverlayState] = useState<OverlayState>({
    key: set.id,
    map: new Map(),
  });
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [routeDataCache, setRouteDataCache] = useState<Map<string, CachedRouteData>>(new Map());

  // Merge server logs with the local overlay (overlay wins per route).
  // Stale-overlay guard inlined: when set.id changes (admin published
  // a new set), the previous overlay is discarded for this render.
  // Keyed-cache pattern from CLAUDE.md — no useEffect setState.
  const logByRoute = useMemo(() => {
    const m = new Map(initialLogs.map((l) => [l.route_id, l]));
    if (overlayState.key === set.id) {
      for (const [routeId, log] of overlayState.map) m.set(routeId, log);
    }
    return m;
  }, [initialLogs, overlayState, set.id]);

  const handleCacheRouteData = useCallback((routeId: string, data: CachedRouteData) => {
    setRouteDataCache((prev) => new Map(prev).set(routeId, data));
  }, []);

  const handleLogUpdate = useCallback((routeId: string, updatedLog: RouteLog) => {
    setOverlayState((prev) => {
      // If the set changed since prev was written, start fresh.
      const base = prev.key === set.id ? prev.map : new Map<string, RouteLog>();
      return { key: set.id, map: new Map(base).set(routeId, updatedLog) };
    });
  }, [set.id]);

  // Aggregate stats are derived from the merged logs so optimistic
  // updates feed the rings + score immediately.
  const mergedLogs = Array.from(logByRoute.values());
  const completedCount = mergedLogs.filter((l) => l.completed).length;
  const flashCount = mergedLogs.filter((l) => isFlash(l)).length;
  const totalScore = mergedLogs.reduce((sum, l) => sum + computePoints(l), 0);

  const endsAt = format(parseISO(set.ends_at), "MMM d");

  return (
    <>
      <div className={styles.page}>
        <StatsWidget
          completions={completedCount}
          total={routes.length}
          flashes={flashCount}
          points={totalScore}
          logs={logByRoute}
          routeIds={routes.map((r) => r.id)}
          routeHasZone={routes.map((r) => r.has_zone)}
          routeNumbers={routes.map((r) => r.number)}
          resetDate={endsAt}
          gymName={gymName}
        />

        <Legend />

        <div className={styles.tileGrid}>
          {routes.map((route) => {
            const log = logByRoute.get(route.id);
            return (
              <SendGridTile
                key={route.id}
                number={route.number}
                state={deriveTileState(log)}
                zone={log?.zone}
                gradeLabel={log?.grade_vote != null ? (formatGrade(log.grade_vote, (set.grading_scale ?? "v") as GradingScale) ?? undefined) : undefined}
                onClick={() => setSelectedRoute(route)}
              />
            );
          })}
        </div>
      </div>

      {selectedRoute && (
        <RouteLogSheet
          set={set}
          route={selectedRoute}
          log={logByRoute.get(selectedRoute.id) ?? null}
          cachedData={routeDataCache.get(selectedRoute.id)}
          onClose={() => setSelectedRoute(null)}
          onCacheRouteData={handleCacheRouteData}
          onLogUpdate={handleLogUpdate}
        />
      )}
    </>
  );
}
