"use client";

import { useState, useEffect } from "react";
import { DemoTile } from "./DemoTile";
import type { DemoTileState } from "./DemoTile";
import styles from "./heroGrid.module.scss";

type TileSet = DemoTileState[];

/**
 * Multiple session snapshots to cycle through.
 * Each array is 12 tiles (4 columns × 3 rows).
 */
const SESSIONS: TileSet[] = [
  // Session A — early session
  [
    "flash",     "completed", "attempted", "empty",
    "completed", "empty",     "completed", "attempted",
    "attempted", "completed", "empty",     "empty",
  ],
  // Session B — mid session
  [
    "completed", "completed", "flash",     "attempted",
    "attempted", "completed", "attempted", "completed",
    "flash",     "empty",     "completed", "empty",
  ],
  // Session C — strong session
  [
    "flash",     "completed", "completed", "completed",
    "completed", "attempted", "flash",     "completed",
    "completed", "flash",     "attempted", "completed",
  ],
];

const TILE_COUNT = 12;
const CYCLE_DURATION = 10000;

// Fixed scattered order — feels random but is deterministic (no hydration mismatch).
// Maps tile index → entrance position in stagger sequence.
const ENTRANCE_ORDER = [3, 8, 1, 10, 6, 0, 11, 4, 9, 2, 7, 5];
const ENTRANCE_STAGGER = 50; // ms between each tile

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
