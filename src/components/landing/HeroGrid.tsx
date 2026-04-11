"use client";

import { useState, useEffect } from "react";
import { DemoTile } from "./DemoTile";
import type { DemoTileState } from "./DemoTile";
import { scatteredOrder } from "@/lib/stagger";
import styles from "./heroGrid.module.scss";

type TileSet = DemoTileState[];

/**
 * Session snapshots — 15 tiles (5 columns × 3 rows) to match the send grid.
 */
const SESSIONS: TileSet[] = [
  // Session A — early session
  [
    "flash",     "completed", "attempted", "empty",     "completed",
    "empty",     "completed", "attempted", "completed", "empty",
    "attempted", "completed", "empty",     "empty",     "attempted",
  ],
  // Session B — mid session
  [
    "completed", "completed", "flash",     "attempted", "completed",
    "attempted", "completed", "attempted", "completed", "flash",
    "flash",     "empty",     "completed", "empty",     "completed",
  ],
  // Session C — strong session
  [
    "flash",     "completed", "completed", "completed", "flash",
    "completed", "attempted", "flash",     "completed", "completed",
    "completed", "flash",     "attempted", "completed", "completed",
  ],
];

const TILE_COUNT = 15;
const CYCLE_DURATION = 10000;
const ENTRANCE_ORDER = scatteredOrder(TILE_COUNT);

export function HeroGrid() {
  const [sessionIndex, setSessionIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSessionIndex((prev) => (prev + 1) % SESSIONS.length);
    }, CYCLE_DURATION);
    return () => clearInterval(id);
  }, []);

  const session = SESSIONS[sessionIndex];

  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: TILE_COUNT }, (_, i) => {
        const state = session[i];
        const animate = state !== "empty";

        return (
          <div
            key={i}
            className={styles.cell}
            style={{ "--entrance-i": ENTRANCE_ORDER[i] } as React.CSSProperties}
          >
            <div className={styles.emptyLayer}>
              <DemoTile number={i + 1} state="empty" />
            </div>
            {animate && (
              <div
                key={`${sessionIndex}-${i}`}
                className={styles.stateLayer}
                style={{ "--reveal-i": i } as React.CSSProperties}
              >
                <DemoTile number={i + 1} state={state} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
