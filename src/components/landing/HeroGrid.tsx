import { DemoTile } from "./DemoTile";
import type { DemoTileState } from "./DemoTile";
import styles from "./heroGrid.module.scss";

/**
 * A realistic in-progress session:
 * 3 completed (lime), 2 flash (amber), 3 attempted (gray), 4 empty
 */
const TILES: { number: number; state: DemoTileState }[] = [
  { number: 1, state: "completed" },
  { number: 2, state: "flash" },
  { number: 3, state: "empty" },
  { number: 4, state: "attempted" },
  { number: 5, state: "empty" },
  { number: 6, state: "completed" },
  { number: 7, state: "attempted" },
  { number: 8, state: "flash" },
  { number: 9, state: "attempted" },
  { number: 10, state: "empty" },
  { number: 11, state: "completed" },
  { number: 12, state: "empty" },
];

// Stagger delays per tile (ms). Non-empty tiles get sequenced delays.
const DELAYS = [0, 120, 0, 240, 0, 360, 480, 600, 720, 0, 840, 0];

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
