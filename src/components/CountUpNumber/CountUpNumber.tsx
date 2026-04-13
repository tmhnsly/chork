"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Roll duration in ms (default ~900). */
  duration?: number;
  className?: string;
}

const DEFAULT_DURATION = 900;

/**
 * Shared easing for every rolling-number entrance in the app.
 * Exponential decelerate (quintic out) — fast start, long soft
 * settle. Matches the `--ease-out-expo` CSS token so JS-driven
 * numeric animations feel consistent with CSS transitions that use
 * the same curve. Exported so any future count-up variant can import
 * this rather than duplicate the math.
 */
export function countUpEase(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

/**
 * Rolls from 0 up to `value` on first mount, and from the previously
 * displayed number to `value` on subsequent changes. Pure text — no
 * per-digit column trickery, just a RAF-driven integer that replaces
 * itself each frame.
 *
 * The count-up always runs when `value` changes, including on the
 * very first render (the initial `display` is 0, so the ramp is
 * guaranteed even for values that happened to stream in from the
 * server). Screen readers read the final value once it settles.
 */
export function CountUpNumber({ value, duration = DEFAULT_DURATION, className }: Props) {
  const [display, setDisplay] = useState(0);
  // Keep the current displayed value in a ref so a mid-animation
  // `value` change can pick up where the previous roll left off
  // instead of snapping back to 0.
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
      const eased = countUpEase(t);
      const next = Math.round(from + delta * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  // Reserve the final value's width from the very first paint so the
  // surrounding layout doesn't reflow as digits appear. `tabular-nums`
  // keeps every digit the same width; `min-width: <target-length>ch`
  // books that width up front. `text-align: right` lands the rolling
  // digits flush against any trailing suffix (e.g. "/14", " pts").
  const width = Math.max(String(value).length, 1);

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        minWidth: `${width}ch`,
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
      }}
    >
      {display}
    </span>
  );
}
