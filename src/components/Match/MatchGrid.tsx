"use client";

import { useMemo } from "react";
import { FaPlus } from "react-icons/fa6";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { deriveTileState } from "@/lib/data/logs";
import { makeGradeLabeller } from "@/lib/data/grade-label";
import { useLongPressTap } from "@/lib/hooks/useLongPressTap";
import type { MatchRoute, MatchLog, MatchGradingScale } from "@/lib/data/match-types";
import styles from "./matchGrid.module.scss";

interface Props {
  routes: MatchRoute[];
  myLogs: Map<string, MatchLog>;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: MatchGradingScale;
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
  gradingScale,
  onTileTap,
  onAddTap,
  onTileLongPress,
}: Props) {
  const labelForGrade = useMemo(
    () => makeGradeLabeller(gradingScale, grades),
    [gradingScale, grades],
  );

  return (
    <div className={styles.grid}>
      {routes.map((route) => {
        const log = myLogs.get(route.id) ?? null;
        const state = deriveTileState(log);
        const gradeLabel = labelForGrade(route.declared_grade);
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
