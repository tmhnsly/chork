"use client";

import { useState } from "react";
import { ActivityRings } from "@/components/ActivityRings/ActivityRings";
import { SetDetailSheet } from "./SetDetailSheet";
import type { Route, RouteLog } from "@/lib/data";
import type { BadgeDefinition } from "@/lib/badges";
import styles from "./previousSetsGrid.module.scss";

export type SetCellLog = Pick<RouteLog, "attempts" | "completed" | "zone">;

export interface SetCell {
  id: string;
  label: string;
  isActive: boolean;
  hasActivity: boolean;
  completions: number;
  flashes: number;
  zones: number;
  points: number;
  totalRoutes: number;
  maxPoints: number;
  routes: Route[];
  logs: Map<string, SetCellLog>;
  badges: BadgeDefinition[];
}

interface Props {
  sets: SetCell[];
  gymId: string;
  userId: string;
  /** Show friendly "you're on your first set" when sets is empty. */
  showEmptyState?: boolean;
}

const SAFE = (n: number, d: number) => (d > 0 ? Math.min(1, n / d) : 0);

export function PreviousSetsGrid({ sets, gymId, userId, showEmptyState = false }: Props) {
  const [openSet, setOpenSet] = useState<SetCell | null>(null);

  if (sets.length === 0) {
    if (!showEmptyState) return null;
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>Sets</h2>
        <p className={styles.empty}>
          You&apos;re on your first set — check back after the reset to see it here.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.title}>Sets</h2>
        <ul className={styles.legend} aria-label="Ring colours">
          <li className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendSends}`} aria-hidden="true" />
            Sends
          </li>
          <li className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendFlash}`} aria-hidden="true" />
            Flashes
          </li>
          <li className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendZone}`} aria-hidden="true" />
            Zones
          </li>
        </ul>
      </header>

      <div className={styles.gridWrapper}>
        <ul className={styles.grid}>
          {sets.map((set) => (
            <li key={set.id}>
              <SetTile set={set} onOpen={() => setOpenSet(set)} />
            </li>
          ))}
        </ul>
      </div>

      {openSet && (
        <SetDetailSheet
          set={openSet}
          gymId={gymId}
          userId={userId}
          onClose={() => setOpenSet(null)}
        />
      )}
    </section>
  );
}

interface TileProps {
  set: SetCell;
  onOpen: () => void;
}

function SetTile({ set, onOpen }: TileProps) {
  const cls = [
    styles.tile,
    set.isActive ? styles.tileActive : "",
    !set.hasActivity ? styles.tileInactive : "",
  ].filter(Boolean).join(" ");

  const rings = set.hasActivity
    ? [
        { value: SAFE(set.completions, set.totalRoutes), color: "var(--brand)" },
        { value: SAFE(set.flashes, set.totalRoutes), color: "var(--flash-solid)" },
        { value: SAFE(set.zones, set.totalRoutes), color: "var(--success-solid)" },
      ]
    : [
        { value: 0, color: "var(--mono-border)" },
        { value: 0, color: "var(--mono-border)" },
        { value: 0, color: "var(--mono-border)" },
      ];

  const content = (
    <>
      <ActivityRings rings={rings} size={72} />
      <span className={styles.label}>{set.label}</span>
      {set.isActive && <span className={styles.activeTag}>Current</span>}
    </>
  );

  if (!set.hasActivity) {
    return <div className={cls} aria-label={`${set.label} — no activity`}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={cls}
      onClick={onOpen}
      aria-label={`${set.label}${set.isActive ? " (current set)" : ""}. ${set.completions} sends, ${set.flashes} flashes, ${set.zones} zones. Open details.`}
    >
      {content}
    </button>
  );
}
