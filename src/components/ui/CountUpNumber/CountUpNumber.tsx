"use client";

import { useEffect, useState } from "react";
import styles from "./countUpNumber.module.scss";

interface Props {
  value: number;
  className?: string;
}

/**
 * Per-digit stagger. Small enough to read as one gesture rather than
 * as digits arriving separately — the leftmost digit leads and the
 * rest follow it in.
 */
const STAGGER_MS = 60;

/**
 * A number that rolls in, one roll per digit.
 *
 * It opens on zeros — as many as the final number has digits, so `8`
 * starts at `0`, `88` at `00`, `823` at `000` — and each column then
 * rolls up **once** to its final digit, staggered left to right.
 *
 * This replaced a count-up that ramped the whole value: `0, 1, 47,
 * 300, …, 823`. That reads as a slot machine and the eye can't do
 * anything with the intermediate numbers, so a big total was just a
 * long wait. A digit only ever travels from 0 to at most 9 here, so
 * the whole thing lands in about the same time whatever the value —
 * a rank of 4 and a points total of 1,284 take the same beat.
 *
 * The motion is CSS: a column of digits translated by
 * `--digit-offset`, per the no-JS-animation-library rule (CLAUDE.md).
 * The only state React holds is "have we rolled yet", flipped once on
 * mount so the transition has a frame to start from.
 *
 * Accessibility: the digit columns are `aria-hidden` and the real
 * value sits in a visually-hidden span, so a screen reader reads
 * "1284" rather than spelling out four animating columns. Reduced
 * motion drops the roll entirely — see the stylesheet.
 */
export function CountUpNumber({ value, className }: Props) {
  // The digits of the final value, left to right. Negative numbers
  // aren't a thing this renders (points, ranks, counts) — `Math.abs`
  // is belt and braces so a stray negative can't produce a "-" column.
  const digits = String(Math.abs(Math.trunc(value))).split("");

  // Which value we've rolled to, rather than a bare boolean — so the
  // reset is DERIVED at render time instead of set in an effect. When
  // `value` changes this is still the old one, `rolled` reads false
  // for that paint, the columns park on zero, and the frame-later
  // write starts the transition. A `setRolled(false)` inside the
  // effect would say the same thing and trip
  // `react-hooks/set-state-in-effect` (CLAUDE.md, performance
  // invariants).
  const [rolledFor, setRolledFor] = useState<number | null>(null);
  const rolled = rolledFor === value;
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRolledFor(value));
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={[styles.root, className].filter(Boolean).join(" ")}>
      <span className={styles.digits} aria-hidden>
        {digits.map((digit, i) => (
          <span
            key={`${i}-${digits.length}`}
            className={styles.column}
            style={
              {
                "--digit-offset": rolled ? Number(digit) : 0,
                "--digit-delay": `${i * STAGGER_MS}ms`,
              } as React.CSSProperties
            }
          >
            <span className={styles.strip}>
              {/* 0–9, so any target digit is one upward roll away. */}
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n} className={styles.digit}>
                  {n}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
      <span className={styles.srOnly}>{value}</span>
    </span>
  );
}
