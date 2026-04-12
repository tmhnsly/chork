"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import type { RouteSet, Route, RouteLog } from "@/lib/data";
import { isFlash, computePoints, deriveTileState } from "@/lib/data";
import { formatGrade, type GradingScale } from "@/lib/data/grade-label";
import { StatsWidget } from "@/components/StatsWidget/StatsWidget";
import { RevealText } from "@/components/motion";
import { PunchTile } from "@/components/PunchTile/PunchTile";
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

export function SendsGrid({ set, routes, initialLogs, gymName }: Props) {
  const [logs, setLogs] = useState<RouteLog[]>(initialLogs);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [routeDataCache, setRouteDataCache] = useState<Map<string, CachedRouteData>>(new Map());

  // Sync when server re-fetches (e.g. revalidation, navigation)
  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  const handleCacheRouteData = useCallback((routeId: string, data: CachedRouteData) => {
    setRouteDataCache((prev) => new Map(prev).set(routeId, data));
  }, []);

  const logByRoute = new Map(logs.map((l) => [l.route_id, l]));

  const completedCount = logs.filter((l) => l.completed).length;
  const flashCount = logs.filter((l) => isFlash(l)).length;
  const totalScore = logs.reduce((sum, l) => sum + computePoints(l), 0);

  const endsAt = format(parseISO(set.ends_at), "MMM d");

  const handleLogUpdate = useCallback((routeId: string, updatedLog: RouteLog) => {
    setLogs((prev) => {
      const idx = prev.findIndex((l) => l.route_id === routeId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedLog;
        return next;
      }
      return [...prev, updatedLog];
    });
  }, []);

  return (
    <>
      <div className={styles.page}>
        <header className={styles.header}>
          <RevealText text="The Wall" as="h2" className={styles.title} />
          {gymName && <p className={styles.gym}>{gymName}</p>}
        </header>

        <StatsWidget
          completions={completedCount}
          total={routes.length}
          flashes={flashCount}
          points={totalScore}
          logs={logByRoute}
          routeIds={routes.map((r) => r.id)}
          routeHasZone={routes.map((r) => r.has_zone)}
          resetDate={endsAt}
        />

        <Legend />

        <div className={styles.tileGrid}>
          {routes.map((route, i) => {
            const log = logByRoute.get(route.id);
            return (
              <PunchTile
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
