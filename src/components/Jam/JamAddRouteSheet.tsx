"use client";

import { useMemo, useState } from "react";
import { BottomSheet, Button } from "@/components/ui";
import { gradeLabels } from "@/lib/data/grade-label";
import type { JamGradingScale, JamRoute } from "@/lib/data/jam-types";
import styles from "./jamAddRouteSheet.module.scss";

interface Props {
  mode: "add" | "edit";
  route?: JamRoute;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: JamGradingScale;
  minGrade: number | null;
  maxGrade: number | null;
  onClose: () => void;
  onSubmit: (payload: {
    description: string | null;
    grade: number | null;
    hasZone: boolean;
  }) => void;
  pending: boolean;
}

/**
 * Sheet for adding or editing a jam route. One component because the
 * fields are identical — mode just changes the title + submit copy.
 */
export function JamAddRouteSheet({
  mode,
  route,
  grades,
  gradingScale,
  minGrade,
  maxGrade,
  onClose,
  onSubmit,
  pending,
}: Props) {
  const [description, setDescription] = useState(route?.description ?? "");
  const [grade, setGrade] = useState<number | null>(route?.grade ?? null);
  const [hasZone, setHasZone] = useState(route?.has_zone ?? false);

  // Compute the ordered label list the picker renders — matches the
  // scale the jam was created with, bounded to the chosen range.
  const options = useMemo(() => {
    if (gradingScale === "custom") {
      return grades.map((g) => ({ value: g.ordinal, label: g.label }));
    }
    const allLabels = gradeLabels(gradingScale, 30);
    const lo = minGrade ?? 0;
    const hi = maxGrade ?? allLabels.length - 1;
    const result: Array<{ value: number; label: string }> = [];
    for (let i = lo; i <= hi; i++) {
      if (allLabels[i]) result.push({ value: i, label: allLabels[i] });
    }
    return result;
  }, [gradingScale, grades, minGrade, maxGrade]);

  function handleSubmit() {
    onSubmit({
      description: description.trim() || null,
      grade,
      hasZone,
    });
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={mode === "add" ? "Add a route" : "Edit route"}
    >
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>Description (optional)</span>
          <textarea
            className={styles.textarea}
            value={description}
            maxLength={240}
            placeholder="e.g. red hold to the top, no matching"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Grade</span>
          <div className={styles.chipRow}>
            <button
              type="button"
              className={`${styles.chip} ${grade === null ? styles.chipActive : ""}`}
              onClick={() => setGrade(null)}
            >
              Ungraded
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.chip} ${grade === opt.value ? styles.chipActive : ""}`}
                onClick={() => setGrade(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.zoneRow}>
          <input
            type="checkbox"
            checked={hasZone}
            onChange={(e) => setHasZone(e.target.checked)}
          />
          <span>
            <span className={styles.zoneTitle}>Has a zone hold</span>
            <span className={styles.zoneDetail}>
              Climbers earn a bonus point for reaching it.
            </span>
          </span>
        </label>

        <Button type="button" onClick={handleSubmit} disabled={pending} fullWidth>
          {pending ? "Saving…" : mode === "add" ? "Add route" : "Save changes"}
        </Button>
      </div>
    </BottomSheet>
  );
}
