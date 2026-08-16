"use client";

import { useRadioGroup } from "../useRadioGroup";
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
 * **A scrolling row**, which is what that picker always was. It got
 * rebuilt as a wrapping grid on the way in here, on the theory that a
 * scale you're choosing from shouldn't hide options past the edge. In
 * practice a full V-scale wraps to three rows, which is a wall of
 * chips that pushes everything below it off the screen — and swiping
 * a row of grades is the gesture climbers already know from the card.
 *
 * Short labels (`V4`, `6a`) come out circular because the min width and
 * height are both the touch target; longer ones (`5.11c`) grow sideways
 * into a stadium of the same height, so a row stays on one rhythm
 * whatever the scale.
 *
 * Keyboard and ARIA come from `useRadioGroup` — one tab stop for the
 * row, arrows select as they move. That matters most here, where a
 * full V-scale is twenty-odd buttons and every one of them being a tab
 * stop is the accessibility bug rather than the fix.
 */
export function GradePicker<T extends number | null>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: Props<T>) {
  const { groupProps, optionProps } = useRadioGroup({
    options,
    value,
    onChange,
    ariaLabel,
    disabled,
  });

  return (
    <div className={styles.row} {...groupProps}>
      {options.map((opt, i) => (
        <button
          key={String(opt.value)}
          {...optionProps(opt, i)}
          className={`${styles.chip} ${opt.value === value ? styles.selected : ""}`}
          // Sheets drag to dismiss; a pointer-down that reaches the
          // sheet turns picking a grade into closing the sheet.
          onPointerDown={(e) => e.stopPropagation()}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
