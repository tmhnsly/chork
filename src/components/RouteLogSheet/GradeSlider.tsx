"use client";

import { useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import styles from "./gradeSlider.module.scss";

const GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10"];

interface Props {
  /** Current grade vote (null = not rated) */
  value: number | null;
  onChange: (grade: number | null) => void;
}

export function GradeSlider({ value, onChange }: Props) {
  const [enabled, setEnabled] = useState(value !== null);
  const [grade, setGrade] = useState(value ?? 5);

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    onChange(checked ? grade : null);
  }

  function handleSelect(index: number) {
    if (!enabled) return;
    setGrade(index);
    onChange(index);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toggleRow}>
        <span className={styles.toggleLabel}>Rate this climb</span>
        <Switch.Root
          className={styles.toggle}
          checked={enabled}
          onCheckedChange={handleToggle}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Switch.Thumb className={styles.toggleThumb} />
        </Switch.Root>
      </div>

      <div className={`${styles.gradeSection} ${enabled ? styles.gradeSectionVisible : ""}`}>
        <div className={styles.gradeRow}>
          {GRADES.map((label, i) => (
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
