"use client";

import { useMemo } from "react";
import { FaPlus } from "react-icons/fa6";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { deriveTileState } from "@/lib/data/logs";
import { makeRouteLabeller, type MatchScales } from "@/lib/data/grade-label";
import { useLongPressTap } from "@/lib/hooks/useLongPressTap";
import type { MatchRoute, MatchLog } from "@/lib/data/match-types";
import styles from "./matchGrid.module.scss";

interface Props {
  routes: MatchRoute[];
  myLogs: Map<string, MatchLog>;
  grades: Array<{ ordinal: number; label: string }>;
  /**
   * The Match's discipline + both scales. A route is labelled in the
   * scale ITS family grades on, not the Match's — on a mixed day a 6b
   * rope route and a V6 boulder share the ordinal 6.
   */
  match: MatchScales;
  onTileTap: (route: MatchRoute) => void;
  onAddTap: () => void;
  onTileLongPress?: (route: MatchRoute) => void;
}

/**
 * Send grid for a live match. Mirrors the wall `SendsGrid` visual
 * language via `SendGridTile`. Trailing `+` tile lets any player add
 * another route at any time — the group self-polices. Tapping a
 * numbered tile opens the log sheet; long-pressing opens the edit
 * sheet (where route metadata is fixable).
 */
export function MatchGrid({
  routes,
  myLogs,
  grades,
  match,
  onTileTap,
  onAddTap,
  onTileLongPress,
}: Props) {
  const labelForRoute = useMemo(
    () => makeRouteLabeller(match, grades),
    [match, grades],
  );

  return (
    <div className={styles.grid}>
      {routes.map((route) => {
        const log = myLogs.get(route.id) ?? null;
        const state = deriveTileState(log);
        const gradeLabel = labelForRoute(route);
        return (
          <MatchTileButton
            key={route.id}
            onTap={() => onTileTap(route)}
            onLongPress={
              onTileLongPress ? () => onTileLongPress(route) : undefined
            }
          >
            <SendGridTile
              number={route.number}
              state={state}
              gradeLabel={gradeLabel ?? undefined}
              zone={route.has_zone || !!log?.zone}
            />
          </MatchTileButton>
        );
      })}
      <button
        type="button"
        className={styles.addTile}
        onClick={onAddTap}
        aria-label="Add a route"
      >
        <FaPlus aria-hidden />
      </button>
    </div>
  );
}

function MatchTileButton({
  onTap,
  onLongPress,
  children,
}: {
  onTap: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
}) {
  const handlers = useLongPressTap({ onTap, onLongPress });
  return (
    <button type="button" className={styles.tileButton} {...handlers}>
      {children}
    </button>
  );
}
