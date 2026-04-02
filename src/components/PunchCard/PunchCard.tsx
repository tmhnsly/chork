"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { FaChartBar, FaBolt, FaCalendarDay, FaStar } from "react-icons/fa6";
import type { Set, Route, RouteLog, TileState } from "@/lib/data";
import { isFlash, computePoints } from "@/lib/data";
import { BentoGrid, BentoStat } from "@/components/ui";
import { PunchTile } from "@/components/PunchTile/PunchTile";
import { RouteLogSheet } from "@/components/RouteLogSheet/RouteLogSheet";
import styles from "./punchCard.module.scss";

interface Props {
  set: Set;
  routes: Route[];
  initialLogs: RouteLog[];
}

function deriveTileState(log: RouteLog | undefined): TileState {
  if (!log || log.attempts === 0) return "empty";
  if (!log.completed) return "attempted";
  if (isFlash(log)) return "flash";
  return "completed";
}

export function PunchCard({ set, routes, initialLogs }: Props) {
  const [logs, setLogs] = useState<RouteLog[]>(initialLogs);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  const logByRoute = new Map(logs.map((l) => [l.route_id, l]));

  const completedCount = logs.filter((l) => l.completed).length;
  const flashCount = logs.filter((l) => isFlash(l)).length;
  const flashRate =
    completedCount > 0 ? Math.round((flashCount / completedCount) * 100) : 0;
  const totalScore = logs.reduce((sum, l) => sum + computePoints(l), 0);

  const resetDate = format(parseISO(set.ends_at), "MMM d");

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
        <h2 className={styles.title}>Punch Card</h2>

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
          {routes.map((route) => {
            const log = logByRoute.get(route.id);
            return (
              <PunchTile
                key={route.id}
                number={route.number}
                state={deriveTileState(log)}
                zone={log?.zone}
                onClick={() => setSelectedRoute(route)}
              />
            );
          })}
        </div>

        <BentoGrid columns={2}>
          <BentoStat
            label="Progress"
            value={`${completedCount}/${routes.length}`}
            icon={<FaChartBar />}
            variant="accent"
          />
          <BentoStat
            label="Score"
            value={totalScore}
            icon={<FaStar />}
          />
          <BentoStat
            label="Flash rate"
            value={`${flashRate}%`}
            icon={<FaBolt />}
            variant="flash"
          />
          <BentoStat
            label="Reset"
            value={resetDate}
            icon={<FaCalendarDay />}
          />
        </BentoGrid>
      </div>

      {selectedRoute && (
        <RouteLogSheet
          set={set}
          route={selectedRoute}
          log={logByRoute.get(selectedRoute.id) ?? null}
          onClose={() => setSelectedRoute(null)}
          onLogUpdate={handleLogUpdate}
        />
      )}
    </>
  );
}
