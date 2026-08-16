"use client";

import { useState } from "react";
import { BottomSheet, Button, GradePicker, SheetBody } from "@/components/ui";
import type { GradeChoice } from "@/components/ui";
import {
  gradeOptions,
  disciplineFamily,
  SCALE_LABEL,
  type MatchScales,
} from "@/lib/data/grade-label";
import type { MatchPlayerView } from "@/lib/data/match-types";
import styles from "./ceilingSheet.module.scss";

interface Props {
  player: MatchPlayerView;
  grades: Array<{ ordinal: number; label: string }>;
  /** Discipline + both scales, so a mixed day can ask for both limits. */
  match: MatchScales;
  onClose: () => void;
  onSubmit: (ceiling: number | null, altCeiling: number | null) => void;
  pending: boolean;
}

/**
 * Declare a player's limit, so the handicap has something to measure
 * against.
 *
 * Your own, or a guest's if you're the host — an account-backed
 * player sets their own, or the handicap becomes something done TO
 * them.
 *
 * "Not set" is a real option, not an empty state: a player without a
 * ceiling scores plain base points, which is the documented fallback
 * rather than a broken row.
 *
 * On a mixed day it asks twice, because a limit is a number on a
 * ladder and V4 shares no arithmetic with 6b — one climber genuinely
 * has two. Each picker is labelled with the scale it is measured in,
 * so "Limit" is never ambiguous about which wall it means.
 */
export function CeilingSheet({
  player,
  grades,
  match,
  onClose,
  onSubmit,
  pending,
}: Props) {
  const [ceiling, setCeiling] = useState<number | null>(player.ceiling);
  const [altCeiling, setAltCeiling] = useState<number | null>(
    player.alt_ceiling,
  );

  const buildOptions = (
    scale: MatchScales["grading_scale"],
    min: number | null,
    max: number | null,
  ): GradeChoice<number | null>[] => [
    { value: null, label: "Not set" },
    ...gradeOptions(scale, { customGrades: grades, min, max }).map((o) => ({
      value: o.value as number | null,
      label: o.label,
    })),
  ];

  const options = buildOptions(
    match.grading_scale,
    match.min_grade,
    match.max_grade,
  );
  const altOptions = match.alt_grading_scale
    ? buildOptions(
        match.alt_grading_scale,
        match.alt_min_grade,
        match.alt_max_grade,
      )
    : null;

  // Name each picker by the wall it measures, not by "limit" twice.
  const primaryFamily = disciplineFamily(match.discipline);
  const primaryLabel =
    primaryFamily === "boulder" ? "Bouldering limit" : "Rope limit";
  const altLabel =
    primaryFamily === "boulder" ? "Rope limit" : "Bouldering limit";

  const name = player.display_name || player.username || "this climber";

  return (
    <BottomSheet open onClose={onClose} title="Set the limit">
      <SheetBody>
        <p className={styles.intro}>
          The hardest grade {player.is_guest ? name : "you"}{" "}
          {player.is_guest ? "climbs" : "climb"}. Sends at that grade score
          full points; easier ones count for less, so everyone competes
          against themselves.
        </p>

        <div className={styles.field}>
          <span className={styles.label}>
            {altOptions ? `${primaryLabel} · ${SCALE_LABEL[match.grading_scale]}` : "Limit"}
          </span>
          <GradePicker<number | null>
            options={options}
            value={ceiling}
            onChange={setCeiling}
            ariaLabel={altOptions ? primaryLabel : "Limit"}
          />
        </div>

        {altOptions && match.alt_grading_scale && (
          <div className={styles.field}>
            <span className={styles.label}>
              {altLabel} · {SCALE_LABEL[match.alt_grading_scale]}
            </span>
            <GradePicker<number | null>
              options={altOptions}
              value={altCeiling}
              onChange={setAltCeiling}
              ariaLabel={altLabel}
            />
          </div>
        )}

        {ceiling === null && altCeiling === null && (
          <p className={styles.hint}>
            {player.is_guest
              ? `Without a limit set, ${name} scores normal points`
              : "Without a limit set, you score normal points"}{" "}
            — the handicap won&apos;t apply.
          </p>
        )}

        <Button
          type="button"
          onClick={() => onSubmit(ceiling, altCeiling)}
          disabled={pending}
          fullWidth
        >
          Save
        </Button>
      </SheetBody>
    </BottomSheet>
  );
}
