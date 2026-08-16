"use client";

import { useMemo, useState } from "react";
import { FaFlag } from "react-icons/fa6";
import {
  BottomSheet,
  Button,
  GradePicker,
  SheetBody,
  TabPills,
  ToggleRow,
} from "@/components/ui";
import type { GradeChoice } from "@/components/ui";
import {
  gradeOptions,
  partialCreditLabel,
  SCALE_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
  type Discipline,
} from "@/lib/data/grade-label";
import type { MatchGradingScale, MatchRoute } from "@/lib/data/match-types";
import styles from "./matchAddRouteSheet.module.scss";

interface Props {
  mode: "add" | "edit";
  route?: MatchRoute;
  grades: Array<{ ordinal: number; label: string }>;
  gradingScale: MatchGradingScale;
  minGrade: number | null;
  maxGrade: number | null;
  /** The Match's default — what this route inherits unless changed. */
  matchDiscipline: Discipline;
  onClose: () => void;
  onSubmit: (payload: {
    description: string | null;
    grade: number | null;
    hasZone: boolean;
    discipline: Discipline;
  }) => void;
  pending: boolean;
}

/**
 * Sheet for adding or editing a match route. One component because the
 * fields are identical — mode just changes the title + submit copy.
 */
export function MatchAddRouteSheet({
  mode,
  route,
  grades,
  gradingScale,
  minGrade,
  maxGrade,
  matchDiscipline,
  onClose,
  onSubmit,
  pending,
}: Props) {
  const [description, setDescription] = useState(route?.description ?? "");
  const [grade, setGrade] = useState<number | null>(route?.declared_grade ?? null);
  const [hasZone, setHasZone] = useState(route?.has_zone ?? false);
  // Null on the route means "inherit", so the picker opens on the
  // Match's default and only diverges if the climber says so.
  const [discipline, setDiscipline] = useState<Discipline>(
    route?.discipline ?? matchDiscipline,
  );

  const pointsOnly = gradingScale === "points";
  // A Match carries ONE grading scale, tied to its own discipline. A
  // route that overrides the discipline can't be graded on it — V4 is
  // not a sport grade — so it goes ungraded rather than being given a
  // number that means nothing. Per-route scales would be the fuller
  // answer; see docs/roadmap.md.
  const offScale = discipline !== matchDiscipline;

  // Compute the ordered label list the picker renders — matches the
  // scale the match was created with, bounded to the chosen range.
  // Points-only matches skip the picker entirely (no grade = no options).
  // First option is `null` ("Ungraded") so climbers without a strong
  // grading opinion can still add the route.
  const options = useMemo<GradeChoice<number | null>[]>(() => {
    if (pointsOnly) return [];
    const ungraded: GradeChoice<number | null> = { value: null, label: "Ungraded" };
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
      // Ungraded when the scale doesn't apply: `points` has no grades,
      // and an off-discipline route can't use this Match's scale.
      grade: pointsOnly || offScale ? null : grade,
      hasZone,
      discipline,
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

        {/* Per-route discipline. Opens on the Match's default; the
            RPC normalises "same as the Match" back to null, so leaving
            it alone keeps the route following the Match. */}
        <div className={styles.field}>
          <span className={styles.label}>Discipline</span>
          <TabPills<Discipline>
            options={DISCIPLINES.map((d) => ({
              value: d,
              label: DISCIPLINE_LABEL[d],
            }))}
            value={discipline}
            onChange={setDiscipline}
            ariaLabel="Discipline"
            layout="wrap"
          />
        </div>

        {!pointsOnly && offScale && (
          <p className={styles.hint}>
            This match is graded in {SCALE_LABEL[gradingScale]}, which
            doesn&apos;t apply to a {DISCIPLINE_LABEL[discipline].toLowerCase()}{" "}
            route — so this one stays ungraded. It still scores points.
          </p>
        )}

        {!pointsOnly && !offScale && (
          <div className={styles.field}>
            <span className={styles.label}>Grade</span>
            <GradePicker<number | null>
              options={options}
              value={grade}
              onChange={setGrade}
              ariaLabel="Grade"
            />
          </div>
        )}

        <ToggleRow
          icon={<FaFlag aria-hidden />}
          title={`${partialCreditLabel(discipline)}${discipline === "boulder" ? " hold" : ""}`}
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
