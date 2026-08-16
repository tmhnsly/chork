"use client";

import { useRef } from "react";
import styles from "./gradePicker.module.scss";

export interface GradeChoice<T extends number | null> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T extends number | null> {
  options: GradeChoice<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required — this is a radio group and needs naming. */
  ariaLabel: string;
  /** Greys the whole row without removing it, e.g. behind a toggle. */
  disabled?: boolean;
}

/**
 * Picking a grade, everywhere in the app.
 *
 * Lifted out of `GradeSlider`, where it was the "Rate this climb" row
 * and the only place that got this right: round, touch-target chips
 * that read as grades rather than as form controls. Every other grade
 * picker had reinvented it — `TabPills` has a 5.5rem minimum sized for
 * word labels like "Flashes", which turns `V0` into a wide rectangle
 * that scrolls off the edge.
 *
 * **Wraps rather than scrolls.** The scrolling version hid grades past
 * the right edge, which is fine for a handful of filters and wrong for
 * a scale you're choosing from — you can't pick what you can't see.
 *
 * Short labels (`V4`, `6a`) come out circular because the min width and
 * height are both the touch target; longer ones (`5.11c`) grow sideways
 * into a stadium of the same height, so a row stays on one rhythm
 * whatever the scale.
 *
 * **Not `useTabList`**, despite the shape. That hook covers tabs
 * (arrows move focus, you activate yourself) and toggle groups (no
 * arrows at all). A radiogroup is the third contract: one tab stop for
 * the whole row, and arrows *select* as they move — which matters most
 * here, where a full V-scale is twenty-odd buttons and every one of
 * them being a tab stop is the accessibility bug, not the fix.
 */
export function GradePicker<T extends number | null>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // The row's single tab stop: the selected chip, or the first one
  // that can take focus when nothing is selected yet.
  const selectedIndex = options.findIndex((o) => o.value === value);
  const focusIndex =
    selectedIndex >= 0
      ? selectedIndex
      : Math.max(0, options.findIndex((o) => !o.disabled));

  function handleKeyDown(e: React.KeyboardEvent, i: number) {
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    // Both axes: the row wraps onto several lines, so up/down is as
    // natural a reach as left/right once the scale is long enough.
    if (!back && !forward) return;
    e.preventDefault();

    const dir = forward ? 1 : -1;
    const len = options.length;
    let j = i;
    for (let step = 0; step < len; step++) {
      j = (j + dir + len) % len;
      if (!options[j]?.disabled) break;
    }
    if (j === i) return;

    // Automatic activation, per the ARIA radiogroup pattern: arrowing
    // onto a grade picks it. Callers debounce their own writes.
    refs.current[j]?.focus();
    onChange(options[j].value);
  }

  return (
    <div className={styles.row} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === focusIndex ? 0 : -1}
            disabled={disabled || opt.disabled}
            className={`${styles.chip} ${selected ? styles.selected : ""}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            // Sheets drag to dismiss; a pointer-down that reaches the
            // sheet turns picking a grade into closing the sheet.
            onPointerDown={(e) => e.stopPropagation()}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
