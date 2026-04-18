"use client";

import { useMemo } from "react";
import { FaPlus } from "react-icons/fa6";
import { SendGridTile } from "@/components/ui/SendGridTile/SendGridTile";
import { deriveTileState } from "@/lib/data/logs";
import { formatGrade } from "@/lib/data/grade-label";
import { useLongPressTap } from "@/lib/hooks/useLongPressTap";
import type { JamRoute, JamLog, JamGradingScale } from "@/lib/data/jam-types";
import styles from "./jamGrid.module.scss";

interface Props {
  routes: JamRoute[];
  myLogs: Map<string, JamLog>;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: JamGradingScale;
  onTileTap: (route: JamRoute) => void;
  onAddTap: () => void;
  onTileLongPress?: (route: JamRoute) => void;
}

/**
 * Send grid for a live jam. Mirrors the wall `SendsGrid` visual
 * language via `SendGridTile`. Trailing `+` tile lets any player add
 * another route at any time — the group self-polices. Tapping a
 * numbered tile opens the log sheet; long-pressing opens the edit
 * sheet (where route metadata is fixable).
 */
export function JamGrid({
  routes,
  myLogs,
  grades,
  gradingScale,
  onTileTap,
  onAddTap,
  onTileLongPress,
}: Props) {
  const gradeLabelByOrdinal = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of grades) map.set(g.ordinal, g.label);
    return map;
  }, [grades]);

  return (
    <div className={styles.grid}>
      {routes.map((route) => {
        const log = myLogs.get(route.id) ?? null;
        const state = deriveTileState(log);
        const gradeLabel = resolveGradeLabel(route.grade, gradingScale, gradeLabelByOrdinal);
        return (
          <JamTileButton
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
          </JamTileButton>
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

function JamTileButton({
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

function resolveGradeLabel(
  grade: number | null,
  scale: JamGradingScale,
  customMap: Map<number, string>,
): string | null {
  if (grade === null || grade === undefined) return null;
  if (scale === "custom") return customMap.get(grade) ?? null;
  return formatGrade(grade, scale);
}
