"use client";

import { useState, useMemo } from "react";
import * as Switch from "@radix-ui/react-switch";
import {
  gradeLabels,
  SCALE_DEFAULT_MAX,
  type GradingScale,
} from "@/lib/data/grade-label";
import styles from "./gradeSlider.module.scss";

interface Props {
  /** Current grade vote (null = not rated) */
  value: number | null;
  onChange: (grade: number | null) => void;
  /** Grading scale of the active set. Defaults to V for backward compat. */
  scale?: GradingScale;
  /** Maximum selectable grade index, bounded by the set's max_grade. */
  maxGrade?: number;
}

/**
 * Climber-facing community-grade slider. The range and labels are
 * derived from the active set's `grading_scale` + `max_grade` so a
 * V-scale set cannot record an 8B vote and a Font-scale set cannot
 * record V17. For `points` scale the admin has opted out of grading
 * entirely; the caller should not render the slider at all.
 */
export function GradeSlider({ value, onChange, scale = "v", maxGrade }: Props) {
  const [enabled, setEnabled] = useState(value !== null);
  const [grade, setGrade] = useState<number | null>(value);

  const labels = useMemo(
    () => gradeLabels(scale, maxGrade ?? SCALE_DEFAULT_MAX[scale]),
    [scale, maxGrade]
  );

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    if (!checked) {
      // Toggling off — clear the grade
      setGrade(null);
      onChange(null);
    }
    // Toggling on — don't fire onChange yet, wait for user to pick a grade
  }

  function handleSelect(index: number) {
    if (!enabled) return;
    setGrade(index);
    onChange(index);
  }

  // Defensive: if the caller forgot to check for `points` scale,
  // collapsing to an empty row at least avoids a broken column.
  if (labels.length === 0) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.toggleRow}>
        <span id="grade-toggle-label" className={styles.toggleLabel}>Rate this climb</span>
        <Switch.Root
          className={styles.toggle}
          checked={enabled}
          onCheckedChange={handleToggle}
          onPointerDown={(e) => e.stopPropagation()}
          aria-labelledby="grade-toggle-label"
        >
          <Switch.Thumb className={styles.toggleThumb} />
        </Switch.Root>
      </div>

      <div className={`${styles.gradeSection} ${enabled ? styles.gradeSectionVisible : ""}`}>
        <div className={styles.gradeRow}>
          {labels.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`${styles.gradeChip} ${i === grade ? styles.gradeChipSelected : ""}`}
              onClick={() => handleSelect(i)}
              disabled={!enabled}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
