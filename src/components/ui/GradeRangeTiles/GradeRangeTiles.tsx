"use client";

import styles from "./gradeRangeTiles.module.scss";

interface Props {
  /** Every grade on the scale, in order. Index is the ordinal. */
  labels: string[];
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}

/**
 * A grade range, as a lit band of tiles.
 *
 * Two things it fixes. The steppers it replaced cost one tap per
 * grade — eight to open a V0–V8 Set — and marking only the two ends
 * left you reading the range rather than seeing it. Every tile
 * between the bounds is filled, so the band IS the answer.
 *
 * Tapping sets the nearer bound: below the range moves the bottom,
 * above it moves the top, and inside it moves whichever end is
 * closer. That rule is invisible but it's the one people reach for —
 * you drag the end you meant, and the only way to be wrong is a tie,
 * which resolves to the bottom.
 */
export function GradeRangeTiles({ labels, min, max, onChange }: Props) {
  function handleTap(value: number) {
    if (value < min) return onChange(value, max);
    if (value > max) return onChange(min, value);
    // Inside: move the nearer end. Ties go to the bottom, which keeps
    // a one-grade range possible from either direction.
    const toMin = value - min;
    const toMax = max - value;
    return toMin <= toMax ? onChange(value, max) : onChange(min, value);
  }

  return (
    <div
      className={styles.strip}
      role="group"
      aria-label={`Grade range, ${labels[min]} to ${labels[max]}`}
    >
      {labels.map((label, value) => {
        const inRange = value >= min && value <= max;
        const isEnd = value === min || value === max;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={inRange}
            aria-label={
              value === min
                ? `Easiest, ${label}`
                : value === max
                  ? `Hardest, ${label}`
                  : label
            }
            className={[
              styles.tile,
              inRange ? styles.inRange : "",
              isEnd ? styles.end : "",
            ].filter(Boolean).join(" ")}
            onClick={() => handleTap(value)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
