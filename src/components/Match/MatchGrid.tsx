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
  /** Whether this viewer may put up the next route (Chork: the pen). */
  canAdd: boolean;
  /** "Add route" / "Set a route" — the tile says what it does. */
  addLabel: string;
  /** Who holds the pen when the viewer doesn't, for the waiting tile. */
  waitingFor?: string | null;
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
  canAdd,
  addLabel,
  waitingFor = null,
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
      {/* The one add-route control on the screen: a tile that says
          what it does, last in the grid, where the route will appear.
          A floating + used to duplicate it with no label. */}
      {canAdd ? (
        <button type="button" className={styles.addTile} onClick={onAddTap}>
          <FaPlus aria-hidden />
          <span className={styles.addLabel}>{addLabel}</span>
        </button>
      ) : (
        <div className={styles.waitTile} aria-live="polite">
          <span className={styles.addLabel}>
            {waitingFor ? `Waiting for @${waitingFor}` : "Waiting for the setter"}
          </span>
        </div>
      )}
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
