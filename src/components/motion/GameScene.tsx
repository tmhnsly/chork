import { CHORK_LETTERS } from "@/lib/data/chork";
import styles from "./gameScene.module.scss";

export type GameScenePreset = "points" | "chork";

interface Props {
  preset: GameScenePreset;
}

/**
 * An animated illustration of a game, for the card you choose it
 * from — the Raditz "scene" idea in Chork's own vocabulary.
 *
 *   points — five bars rising to different heights on a stagger, the
 *            tallest carrying a spark. A scoreboard filling.
 *   chork  — the five letter tiles, one lighting up at a time and
 *            then clearing. The board's own word, played.
 *
 * Each preset owns a colour: Points is the accent, Chork is flash
 * gold — two hue families, so they read apart under colour-blindness
 * and a game keeps its colour wherever it is named next. Pure CSS
 * keyframes on marks sized in container units, so the same scene
 * fills a poster or a thumbnail. Decorative: `aria-hidden`, the card
 * carries the words.
 */
export function GameScene({ preset }: Props) {
  return (
    <div className={styles.scene} data-preset={preset} aria-hidden>
      {preset === "points" ? (
        <div className={styles.bars}>
          {BAR_HEIGHTS.map((h, i) => (
            <span
              key={i}
              className={styles.bar}
              style={{ "--i": i, "--h": h } as React.CSSProperties}
            >
              {i === TALLEST && <span className={styles.spark} />}
            </span>
          ))}
        </div>
      ) : (
        <div className={styles.word}>
          {CHORK_LETTERS.map((letter, i) => (
            <span
              key={letter}
              className={styles.tile}
              style={{ "--i": i } as React.CSSProperties}
            >
              {letter}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bar heights as a fraction of the stage — a real-looking board, not a ramp. */
const BAR_HEIGHTS = [0.45, 0.7, 0.55, 1, 0.8];
const TALLEST = BAR_HEIGHTS.indexOf(1);
