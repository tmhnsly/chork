"use client";

import type { Dispatch } from "react";
import {
  FaPlus,
  FaXmark,
  FaArrowUp,
  FaArrowDown,
  FaScaleBalanced,
} from "react-icons/fa6";
import { ChoiceTiles, ToggleRow } from "@/components/ui";
import {
  SCALE_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
  DISCIPLINE_SCALES,
  disciplineFamily,
  type Discipline,
} from "@/lib/data/grade-label";
import type { MatchGradingScale, SavedScale } from "@/lib/data/match-types";
import {
  isFormulaScale,
  MAX_CUSTOM_GRADES,
  type CreateMatchAction,
  type CreateMatchState,
  type FormulaScale,
} from "./createMatchReducer";
import styles from "./gradingSetup.module.scss";

type ScaleTab = MatchGradingScale;

/**
 * The discipline question, as climbers ask it. "Mixed" is not a
 * `Discipline` in the database — underneath it is the primary
 * discipline plus an alternate ladder — but it belongs in this list,
 * because "am I climbing boulders, ropes, or both today" is one
 * question.
 */
type DisciplineChoice = Discipline | "mixed";

const DISCIPLINE_CHOICES: { value: DisciplineChoice; label: string; detail?: string }[] = [
  ...DISCIPLINES.map((d) => ({ value: d as DisciplineChoice, label: DISCIPLINE_LABEL[d] })),
  { value: "mixed", label: "Mixed", detail: "Boulders and ropes" },
];

/**
 * Scales offered for a discipline: its own, then the two that suit
 * any of them. You cannot grade a rope in V, and offering it is how
 * a Match ends up mis-scaled.
 */
function scaleOptions(discipline: Discipline): { value: ScaleTab; label: string }[] {
  return [...DISCIPLINE_SCALES[discipline], "custom" as const, "points" as const]
    .map((value) => ({ value, label: SCALE_LABEL[value] }));
}

/** The discipline's own ladders only — what a mixed day can choose from. */
function formulaScaleOptions(discipline: Discipline): { value: ScaleTab; label: string }[] {
  return DISCIPLINE_SCALES[discipline].map((value) => ({ value, label: SCALE_LABEL[value] }));
}

interface Props {
  state: CreateMatchState;
  dispatch: Dispatch<CreateMatchAction>;
  savedScales: SavedScale[];
  /** Fired instead of adding when the ladder is full; the host toasts. */
  onMaxGrades: () => void;
}

/**
 * What you're climbing and how it's graded: discipline (with Mixed as
 * a fourth choice), the scale, a mixed day's second scale, the
 * handicap, and the custom ladder editor with saved scales.
 *
 * Owns no state — the create-match reducer models a match's setup,
 * and this is its UI. It was the middle step of a create wizard;
 * now it is the body of the lobby's "climbing" sheet, because setup
 * belongs where the people it's for can see it happen.
 */
export function GradingSetup({ state, dispatch, savedScales, onMaxGrades }: Props) {
  const {
    discipline,
    handicap,
    scale,
    altScale,
    customGrades,
    newGradeInput,
    saveScale,
    scaleName,
  } = state;

  // Which family the Match's own scale grades for — names the two
  // ladders on a mixed day and decides which one the alternate offers.
  const primaryFamily = disciplineFamily(discipline);
  const otherFamilyLabel = primaryFamily === "boulder" ? "Rope grades" : "Boulder grades";
  const ownFamilyLabel = primaryFamily === "boulder" ? "Boulder grades" : "Rope grades";
  const altScaleChoices: readonly FormulaScale[] =
    primaryFamily === "boulder" ? ["french", "yds"] : ["v", "font"];

  // A mixed day IS "has an alternate ladder" — one source of truth,
  // read both ways rather than stored twice.
  const isMixed = altScale !== null;
  const disciplineChoice: DisciplineChoice = isMixed ? "mixed" : discipline;

  function chooseDiscipline(next: DisciplineChoice) {
    if (next === "mixed") {
      // Mixed keeps whichever real discipline is already chosen as
      // the primary and adds the other family's ladder. Two ladders
      // need a scale that HAS a family — points has no grades and a
      // custom ladder covers everything — so a mixed day on either
      // first moves the primary onto its discipline's own scale.
      if (!isFormulaScale(scale)) {
        dispatch({ type: "set-scale", scale: DISCIPLINE_SCALES[discipline][0] });
      }
      dispatch({ type: "set-mixed", value: true });
      return;
    }
    dispatch({ type: "set-discipline", discipline: next });
    dispatch({ type: "set-mixed", value: false });
  }

  function addCustomGrade() {
    if (!newGradeInput.trim()) return;
    if (customGrades.length >= MAX_CUSTOM_GRADES) return onMaxGrades();
    dispatch({ type: "add-grade" });
  }

  return (
    <div className={styles.root}>
      {/* No heading for the first choice: the sheet's own title asks
          "What are you climbing?", and asking twice read as a bug. */}
      <ChoiceTiles<DisciplineChoice>
        options={DISCIPLINE_CHOICES}
        value={disciplineChoice}
        onChange={chooseDiscipline}
        ariaLabel="Discipline"
      />

      <h2 className={styles.question}>
        {isMixed ? ownFamilyLabel : "How are they graded?"}
      </h2>
      {/* On a mixed day only the formula scales are offered: picking
          custom or points would silently drop the second ladder. */}
      <ChoiceTiles<ScaleTab>
        options={isMixed ? formulaScaleOptions(discipline) : scaleOptions(discipline)}
        value={scale}
        onChange={(next) => dispatch({ type: "set-scale", scale: next })}
        ariaLabel="Grading scale"
      />
      {scale === "points" && (
        <p className={styles.hint}>
          No grades — every route is ungraded and the leaderboard ranks
          purely by points from attempts and zones.
        </p>
      )}

      {isMixed && altScale && (
        <>
          <h2 className={styles.question}>{otherFamilyLabel}</h2>
          <ChoiceTiles<FormulaScale>
            options={altScaleChoices.map((value) => ({ value, label: SCALE_LABEL[value] }))}
            value={altScale}
            onChange={(next) => dispatch({ type: "set-alt-scale", scale: next })}
            ariaLabel={otherFamilyLabel}
          />
        </>
      )}

      {/* Only on a graded scale — a handicap measures a send against
          a grade, and points has none while a custom ladder's
          ordinals aren't a difficulty scale. */}
      {isFormulaScale(scale) && (
        <ToggleRow
          icon={<FaScaleBalanced aria-hidden />}
          title="Handicap"
          detail="Score everyone against their own limit, so climbers of different grades can compete."
          checked={handicap}
          onChange={(value) => dispatch({ type: "set-handicap", value })}
        />
      )}

      {scale === "custom" && (
        <div className={styles.customSection}>
          {savedScales.length > 0 && (
            <div className={styles.savedPills}>
              <span className={styles.savedLabel}>Use a saved scale:</span>
              {savedScales.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  className={styles.savedPill}
                  onClick={() => dispatch({ type: "apply-saved-scale", saved: sc })}
                >
                  {sc.name}
                </button>
              ))}
            </div>
          )}

          <div className={styles.addGradeRow}>
            <input
              type="text"
              className={styles.input}
              value={newGradeInput}
              maxLength={40}
              placeholder="e.g. Red Circuit"
              aria-label="Grade name"
              onChange={(e) => dispatch({ type: "set-new-grade-input", value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomGrade();
                }
              }}
            />
            <button
              type="button"
              className={styles.addButton}
              onClick={addCustomGrade}
              disabled={!newGradeInput.trim()}
              aria-label="Add grade"
            >
              <FaPlus aria-hidden />
            </button>
          </div>

          {customGrades.length > 0 && (
            <>
              <p className={styles.gradeHint}>
                Order easiest to hardest. Use the arrows to reorder.
              </p>
              <ol className={styles.gradeList}>
                {customGrades.map((g, i) => (
                  <li key={`${g}-${i}`} className={styles.gradeItem}>
                    <span className={styles.gradeOrdinal}>{i + 1}</span>
                    <span className={styles.gradeLabel}>{g}</span>
                    <div className={styles.gradeActions}>
                      <button
                        type="button"
                        className={styles.gradeIconBtn}
                        onClick={() => dispatch({ type: "move-grade", index: i, delta: -1 })}
                        disabled={i === 0}
                        aria-label="Move up"
                      >
                        <FaArrowUp aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={styles.gradeIconBtn}
                        onClick={() => dispatch({ type: "move-grade", index: i, delta: 1 })}
                        disabled={i === customGrades.length - 1}
                        aria-label="Move down"
                      >
                        <FaArrowDown aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={styles.gradeIconBtn}
                        onClick={() => dispatch({ type: "remove-grade", index: i })}
                        aria-label="Remove"
                      >
                        <FaXmark aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>

              <ToggleRow
                title="Save this scale"
                detail="Reuse it next game without re-entering the grades."
                checked={saveScale}
                onChange={(checked) => dispatch({ type: "set-save-scale", value: checked })}
              />

              {saveScale && (
                <label className={styles.field}>
                  <span className={styles.label}>Scale name</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={scaleName}
                    maxLength={40}
                    placeholder="e.g. The garage board"
                    onChange={(e) => dispatch({ type: "set-scale-name", value: e.target.value })}
                    required
                  />
                </label>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
