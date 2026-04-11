"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import type { RouteSet, Route, RouteLog, TileState } from "@/lib/data";
import { isFlash, computePoints } from "@/lib/data";
import { StatsWidget } from "@/components/StatsWidget/StatsWidget";
import { RevealText } from "@/components/motion";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import { RouteLogSheet } from "@/components/RouteLogSheet/RouteLogSheet";
import type { CachedRouteData } from "@/components/RouteLogSheet/RouteLogSheet";
import styles from "./sendGrid.module.scss";

interface Props {
  set: RouteSet;
  routes: Route[];
  initialLogs: RouteLog[];
}

function deriveTileState(log: RouteLog | undefined): TileState {
  if (!log || log.attempts === 0) return "empty";
  if (!log.completed) return "attempted";
  if (isFlash(log)) return "flash";
  return "completed";
}

export function SendGrid({ set, routes, initialLogs }: Props) {
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

  function handleLogUpdate(routeId: string, updatedLog: RouteLog) {
    setLogs((prev) => {
      const idx = prev.findIndex((l) => l.route_id === routeId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedLog;
        return next;
      }
      return [...prev, updatedLog];
    });
  }

  return (
    <>
      <div className={styles.page}>
        <div className={styles.header}>
          <RevealText text="Send Grid" as="h2" className={styles.title} />
          <span className={styles.resetDate}>Resets {endsAt}</span>
        </div>

        <StatsWidget
          completions={completedCount}
          total={routes.length}
          flashes={flashCount}
          points={totalScore}
          logs={logByRoute}
          routeIds={routes.map((r) => r.id)}
          routeHasZone={routes.map((r) => r.has_zone)}
        />

        <footer className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.swatchCompleted}`} />
            Completed
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.swatchFlash}`} />
            Flash
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.swatchAttempted}`} />
            Attempted
          </span>
        </footer>

        <div className={styles.tileGrid}>
          {routes.map((route, i) => {
            const log = logByRoute.get(route.id);
            return (
              <PunchTile
                key={route.id}
                number={route.number}
                state={deriveTileState(log)}
                zone={log?.zone}
                onClick={() => setSelectedRoute(route)}
                className={styles.tileEntrance}
                style={{ "--i": i } as React.CSSProperties}
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
