"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Ramp duration in ms (default ~700). Same duration on all changes so
   *  the cadence stays consistent whether counting 0→42 on mount or
   *  5→6 after a send. */
  duration?: number;
  className?: string;
}

// Ease-in (cubic) — starts slow, accelerates toward the target.
// Matches "ramp up speed" for first-paint count-ups; also works well
// for small value deltas on updates (the delta is tiny so easing
// choice is barely perceptible there).
function easeIn(t: number): number {
  return t * t * t;
}

const DEFAULT_DURATION = 700;

/**
 * Counts from the previously-displayed number to `value` whenever
 * `value` changes, ease-in. On first mount the previous is 0, so the
 * number ramps up from zero — the arrival effect. Subsequent changes
 * (a climber logs or un-logs a send) animate from the current number
 * to the new one in the same curve, so the card's stats feel alive
 * when mutated.
 */
export function CountUpNumber({ value, duration = DEFAULT_DURATION, className }: Props) {
  const [display, setDisplay] = useState(0);
  // Keep the live displayed value in a ref so the effect can read it
  // without re-running every tick (which would tear the animation).
  const displayRef = useRef(0);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) return;

    let raf = 0;
    const start = performance.now();
    const delta = to - from;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeIn(t);
      const next = Math.round(from + delta * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{display}</span>;
}
