import { DemoTile } from "./DemoTile";
import type { DemoTileState } from "./DemoTile";
import styles from "./heroGrid.module.scss";

/**
 * A realistic in-progress session — 5 columns, 3 rows.
 * Tells the story: flashes, sends, projects, untouched.
 */
const TILES: { number: number; state: DemoTileState }[] = [
  // Row 1
  { number: 1, state: "flash" },
  { number: 2, state: "completed" },
  { number: 3, state: "attempted" },
  { number: 4, state: "empty" },
  { number: 5, state: "empty" },
  // Row 2
  { number: 6, state: "completed" },
  { number: 7, state: "flash" },
  { number: 8, state: "completed" },
  { number: 9, state: "attempted" },
  { number: 10, state: "empty" },
  // Row 3
  { number: 11, state: "attempted" },
  { number: 12, state: "completed" },
  { number: 13, state: "empty" },
  { number: 14, state: "empty" },
  { number: 15, state: "empty" },
];

// Stagger delays (ms) — only non-empty tiles animate in
const DELAYS = [0, 120, 240, 0, 0, 360, 480, 600, 720, 0, 840, 960, 0, 0, 0];

export function HeroGrid() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {TILES.map((tile, i) => {
        const animate = tile.state !== "empty";
        const cls = [styles.cell, animate ? styles.cellAnimate : ""]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={tile.number} className={cls}>
            {/* Empty state shown during the "hidden" phase of the animation */}
            <div className={styles.emptyLayer}>
              <DemoTile number={tile.number} state="empty" />
            </div>
            {/* Final state fades in via animation */}
            {animate && (
              <div
                className={styles.stateLayer}
                style={{ animationDelay: `${DELAYS[i]}ms` }}
              >
                <DemoTile number={tile.number} state={tile.state} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
