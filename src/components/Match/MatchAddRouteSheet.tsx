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
  DISCIPLINES,
  DISCIPLINE_LABEL,
  disciplineFamily,
  scaleForDiscipline,
  type Discipline,
  type MatchScales,
} from "@/lib/data/grade-label";
import type { MatchRoute } from "@/lib/data/match-types";
import styles from "./matchAddRouteSheet.module.scss";

interface Props {
  mode: "add" | "edit";
  route?: MatchRoute;
  grades: Array<{ ordinal: number; label: string }>;
  /**
   * The Match's discipline + both its scales. Passed whole rather than
   * as a flattened scale, because which scale applies depends on the
   * discipline chosen INSIDE this sheet — a rope route on a
   * bouldering Match grades on the alternate ladder (migration 117).
   */
  match: MatchScales;
  /**
   * Chork changes what putting a route up IS: not one more thing to
   * climb, but your turn — a challenge you now have to send yourself.
   * The copy follows, and the zone toggle goes, because a zone is
   * worth a bonus POINT and Chork hasn't got any.
   */
  isChork?: boolean;
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
  isChork = false,
  grades,
  match,
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
    route?.discipline ?? match.discipline,
  );

  // The ladder this route grades on. A bouldering Match with ropes set
  // up resolves a top-rope route to the rope scale; a single-discipline
  // Match resolves the other family to nothing, and the route stays
  // ungraded — which used to be EVERY off-discipline route.
  const resolved = scaleForDiscipline(match, discipline);
  const pointsOnly = resolved?.scale === "points";
  const offScale = resolved === null;

  // Compute the ordered label list the picker renders — matches the
  // scale the match was created with, bounded to the chosen range.
  // Points-only matches skip the picker entirely (no grade = no options).
  // First option is `null` ("Ungraded") so climbers without a strong
  // grading opinion can still add the route.
  const options = useMemo<GradeChoice<number | null>[]>(() => {
    if (pointsOnly || resolved === null) return [];
    const ungraded: GradeChoice<number | null> = { value: null, label: "Ungraded" };
    return [
      ungraded,
      ...gradeOptions(resolved.scale, {
        customGrades: grades,
        min: resolved.min,
        max: resolved.max,
      }),
    ];
  }, [pointsOnly, resolved, grades]);

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
      title={
        mode === "edit"
          ? "Edit route"
          : isChork
            ? "Set a challenge"
            : "Add a route"
      }
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

        {/* Only reachable now on a single-discipline Match, when
            someone switches a route to the family they said they
            weren't climbing. Before 117 this was every rope route on
            a bouldering Match. */}
        {offScale && (
          <p className={styles.hint}>
            This match was set up for{" "}
            {disciplineFamily(match.discipline) === "boulder"
              ? "bouldering"
              : "ropes"}{" "}
            only, so there&apos;s no{" "}
            {DISCIPLINE_LABEL[discipline].toLowerCase()} scale to grade on
            — this one stays ungraded. It still scores points.
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

        {/* A zone is worth a bonus POINT, and Chork does not have
            any — the letter rule never looks at it. Offering the
            toggle there was a control that did nothing. */}
        {!isChork && (
          <ToggleRow
            icon={<FaFlag aria-hidden />}
            title={`${partialCreditLabel(discipline)}${discipline === "boulder" ? " hold" : ""}`}
            detail="Climbers earn a bonus point for reaching it."
            checked={hasZone}
            onChange={setHasZone}
          />
        )}

        <Button type="button" onClick={handleSubmit} disabled={pending} fullWidth>
          {pending
            ? "Saving…"
            : mode === "edit"
              ? "Save changes"
              : isChork
                ? "Set it"
                : "Add route"}
        </Button>
      </SheetBody>
    </BottomSheet>
  );
}
