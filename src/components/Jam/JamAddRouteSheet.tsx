"use client";

import { useMemo, useState } from "react";
import { FaFlag } from "react-icons/fa6";
import { BottomSheet, Button, SheetBody, TabPills, ToggleRow } from "@/components/ui";
import type { TabPillOption } from "@/components/ui";
import { gradeOptions } from "@/lib/data/grade-label";
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

  const pointsOnly = gradingScale === "points";

  // Compute the ordered label list the picker renders — matches the
  // scale the jam was created with, bounded to the chosen range.
  // Points-only jams skip the picker entirely (no grade = no options).
  // First option is `null` ("Ungraded") so climbers without a strong
  // grading opinion can still add the route.
  const options = useMemo<TabPillOption<number | null>[]>(() => {
    if (pointsOnly) return [];
    const ungraded: TabPillOption<number | null> = { value: null, label: "Ungraded" };
    return [
      ungraded,
      ...gradeOptions(gradingScale, {
        customGrades: grades,
        min: minGrade,
        max: maxGrade,
      }),
    ];
  }, [pointsOnly, gradingScale, grades, minGrade, maxGrade]);

  function handleSubmit() {
    onSubmit({
      description: description.trim() || null,
      grade: pointsOnly ? null : grade,
      hasZone,
    });
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={mode === "add" ? "Add a route" : "Edit route"}
    >
      <SheetBody>
        <label className={styles.field}>
          <span className={styles.label}>Description</span>
          <textarea
            className={styles.textarea}
            value={description}
            maxLength={240}
            placeholder="e.g. red hold to the top, no matching"
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className={styles.hint}>Optional — sketch the beta in a sentence.</span>
        </label>

        {!pointsOnly && (
          <div className={styles.field}>
            <span className={styles.label}>Grade</span>
            <TabPills<number | null>
              options={options}
              value={grade}
              onChange={setGrade}
              ariaLabel="Grade"
              layout="wrap"
            />
          </div>
        )}

        <ToggleRow
          icon={<FaFlag aria-hidden />}
          title="Zone hold"
          detail="Climbers earn a bonus point for reaching it."
          checked={hasZone}
          onChange={setHasZone}
        />

        <Button type="button" onClick={handleSubmit} disabled={pending} fullWidth>
          {pending ? "Saving…" : mode === "add" ? "Add route" : "Save changes"}
        </Button>
      </SheetBody>
    </BottomSheet>
  );
}
