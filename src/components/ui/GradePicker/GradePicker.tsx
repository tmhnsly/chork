"use client";

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
 */
export function GradePicker<T extends number | null>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: Props<T>) {
  return (
    <div className={styles.row} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || opt.disabled}
            className={`${styles.chip} ${selected ? styles.selected : ""}`}
            onClick={() => onChange(opt.value)}
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
