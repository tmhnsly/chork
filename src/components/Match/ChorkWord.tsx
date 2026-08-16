import { CHORK_LETTERS } from "@/lib/data/chork";
import styles from "./chorkWord.module.scss";

interface Props {
  /** How many letters this seat has earned, 0–5. */
  letters: number;
}

/**
 * C-H-O-R-K with the earned letters lit.
 *
 * The whole Chork board is this repeated down the page — you read who
 * is one away at a glance, which is the only question the game asks.
 * Lives on its own because the live room and the final result both
 * show it, and a result whose letters looked different from the board
 * they were earned on would read as a different number.
 *
 * No client boundary: it is a span of letters.
 */
export function ChorkWord({ letters }: Props) {
  const lit = Math.min(Math.max(letters, 0), CHORK_LETTERS.length);
  return (
    <span
      className={styles.word}
      aria-label={
        lit === 0
          ? "No letters"
          : `${CHORK_LETTERS.slice(0, lit).join("")}, ${lit} of ${CHORK_LETTERS.length}`
      }
    >
      {CHORK_LETTERS.map((letter, i) => (
        <span
          key={letter}
          className={i < lit ? styles.lit : styles.unlit}
          aria-hidden
        >
          {letter}
        </span>
      ))}
    </span>
  );
}
