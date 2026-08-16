"use client";

import { useReducer, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FaPlus,
  FaXmark,
  FaArrowUp,
  FaArrowDown,
  FaScaleBalanced,
} from "react-icons/fa6";
import {
  Button,
  ChoiceTiles,
  GradePicker,
  ToggleRow,
  showToast,
} from "@/components/ui";
import {
  gradeOptions,
  SCALE_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
  DISCIPLINE_SCALES,
  type Discipline,
  type CustomGradeEntry,
} from "@/lib/data/grade-label";
import type { MatchGradingScale, SavedScale } from "@/lib/data/match-types";
import { createMatchAction, setMatchGameMode } from "@/app/match/actions";
import { countOf } from "@/lib/plural";
import type { GradeChoice } from "@/components/ui";
import {
  buildCreateMatchPayload,
  canSubmit as deriveCanSubmit,
  createMatchReducer,
  isFormulaScale,
  initialCreateMatchState,
  MAX_CUSTOM_GRADES,
} from "./createMatchReducer";
import styles from "./createMatchForm.module.scss";

interface Props {
  savedScales: SavedScale[];
}

type ScaleTab = MatchGradingScale;

const DISCIPLINE_OPTIONS: { value: Discipline; label: string }[] =
  DISCIPLINES.map((d) => ({ value: d, label: DISCIPLINE_LABEL[d] }));

/**
 * Scales offered for a discipline: its own, then the two that suit
 * any of them. You cannot grade a rope in V, and offering it is how
 * a Match ends up mis-scaled.
 */
function scaleOptions(discipline: Discipline): { value: ScaleTab; label: string }[] {
  return [...DISCIPLINE_SCALES[discipline], "custom" as const, "points" as const]
    .map((value) => ({ value, label: SCALE_LABEL[value] }));
}

export function CreateMatchForm({ savedScales }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // All form state lives in the pure reducer — `scale` is the
  // state-machine key, and canSubmit / the submit payload derive
  // from state in ONE place (createMatchReducer.ts).
  const [state, dispatch] = useReducer(
    createMatchReducer,
    undefined,
    initialCreateMatchState,
  );
  const {
    name,
    location,
    discipline,
  gameMode,
    handicap,
    scale,
    ranges,
    customGrades,
    newGradeInput,
    saveScale,
    scaleName,
  } = state;

  const canSubmit = deriveCanSubmit(state, pending);

  function addCustomGrade() {
    if (!newGradeInput.trim()) return;
    if (customGrades.length >= MAX_CUSTOM_GRADES) {
      showToast("Max 50 grades", "error");
      return;
    }
    dispatch({ type: "add-grade" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    startTransition(async () => {
      const payload = buildCreateMatchPayload(state);
      const result = await createMatchAction(payload);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      // Set after creation rather than as a tenth argument to
      // `create_match` — see the note on `setMatchGameMode`. Only
      // fires when it isn't the default, and a failure here leaves a
      // playable points Match rather than nothing.
      if (payload.gameMode !== "points") {
        const mode = await setMatchGameMode(result.id, payload.gameMode);
        if ("error" in mode) showToast(mode.error, "error");
      }
      router.push(`/match/${result.id}`);
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* Identity */}
      <label className={styles.field}>
        <span className={styles.label}>Name (optional)</span>
        <input
          type="text"
          className={styles.input}
          value={name}
          maxLength={80}
          placeholder="e.g. Friday sesh"
          onChange={(e) => dispatch({ type: "set-name", value: e.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Location (optional)</span>
        <input
          type="text"
          className={styles.input}
          value={location}
          maxLength={120}
          placeholder="e.g. Fontainebleau, The garage"
          onChange={(e) =>
            dispatch({ type: "set-location", value: e.target.value })
          }
        />
      </label>

      {/* How it's won, before anything about grades — Chork changes
          what the whole screen is for. */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Game</legend>
        <ChoiceTiles<"points" | "chork">
          options={[
            {
              value: "points",
              label: "Points",
              detail: "Most points wins",
            },
            {
              value: "chork",
              label: "Chork",
              detail: "Miss and take a letter",
            },
          ]}
          value={gameMode}
          onChange={(next) => dispatch({ type: "set-game-mode", value: next })}
          ariaLabel="Game mode"
        />
        {gameMode === "chork" && (
          <p className={styles.scaleHint}>
            Set a route and send it — everyone else gets as many goes as
            you took. Spell CHORK and you&rsquo;re out.
          </p>
        )}
      </fieldset>

      {/* Discipline next — it decides which scales are on offer. */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Discipline</legend>
        <ChoiceTiles<Discipline>
          options={DISCIPLINE_OPTIONS}
          value={discipline}
          onChange={(next) =>
            dispatch({ type: "set-discipline", discipline: next })
          }
          ariaLabel="Discipline"
        />
        <p className={styles.scaleHint}>
          Sets the default for this match. Any route can be a different
          discipline — handy for an outdoor day mixing boulders and ropes.
        </p>
      </fieldset>

      {/* Scale picker — the discipline's own scales, plus Custom / Points */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Grading scale</legend>
        <ChoiceTiles<ScaleTab>
          options={scaleOptions(discipline)}
          value={scale}
          onChange={(next) => dispatch({ type: "set-scale", scale: next })}
          ariaLabel="Grading scale"
        />
        {scale === "points" && (
          <p className={styles.scaleHint}>
            No grades — every route is ungraded and the leaderboard ranks
            purely by points from attempts + zones.
          </p>
        )}
      </fieldset>

      {/* Only offered on a graded scale — a handicap measures a send
          against a grade, and `points` has none while a custom
          ladder's ordinals aren't a difficulty scale. */}
      {isFormulaScale(scale) && (
        <ToggleRow
          icon={<FaScaleBalanced aria-hidden />}
          title="Handicap"
          detail="Score everyone against their own limit, so climbers of different grades can compete."
          checked={handicap}
          onChange={(value) => dispatch({ type: "set-handicap", value })}
        />
      )}

      {isFormulaScale(scale) && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Grade range</legend>
          <RangePicker
            scale={scale}
            customGrades={customGrades.map((label, ordinal) => ({ ordinal, label }))}
            min={ranges[scale][0]}
            max={ranges[scale][1]}
            onChange={(min, max) =>
              dispatch({ type: "set-range", scale, min, max })
            }
          />
        </fieldset>
      )}
      {scale === "custom" && (
        <div className={styles.customSection}>
          {savedScales.length > 0 && (
            <div className={styles.savedPills}>
              <span className={styles.savedLabel}>Use a saved scale:</span>
              {savedScales.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={styles.savedPill}
                  onClick={() => dispatch({ type: "apply-saved-scale", saved: s })}
                >
                  {s.name}
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
              onChange={(e) =>
                dispatch({ type: "set-new-grade-input", value: e.target.value })
              }
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
                        onClick={() =>
                          dispatch({ type: "move-grade", index: i, delta: -1 })
                        }
                        disabled={i === 0}
                        aria-label="Move up"
                      >
                        <FaArrowUp aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={styles.gradeIconBtn}
                        onClick={() =>
                          dispatch({ type: "move-grade", index: i, delta: 1 })
                        }
                        disabled={i === customGrades.length - 1}
                        aria-label="Move down"
                      >
                        <FaArrowDown aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={styles.gradeIconBtn}
                        onClick={() =>
                          dispatch({ type: "remove-grade", index: i })
                        }
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
                detail="Reuse it next match without re-entering the grades."
                checked={saveScale}
                onChange={(checked) =>
                  dispatch({ type: "set-save-scale", value: checked })
                }
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
                    onChange={(e) =>
                      dispatch({ type: "set-scale-name", value: e.target.value })
                    }
                    required
                  />
                </label>
              )}
            </>
          )}
        </div>
      )}

      <Button type="submit" disabled={!canSubmit} fullWidth>
        {pending ? "Starting match…" : "Start match"}
      </Button>
    </form>
  );
}

/**
 * The grade range, picked with the SAME control as everywhere else.
 *
 * One `GradePicker` per bound — the round, wrapping row of tappable
 * grades that the card's "Rate this climb" row, the log sheet and the
 * ceiling sheet all use. Every place a climber picks a grade now looks
 * and behaves identically, which is the whole point: this screen had a
 * bespoke ◀ ▶ stepper before, and a control that appears once teaches
 * nothing.
 *
 * The full scale is offered on both rows rather than only the legal
 * half; the impossible options are disabled, so the row doesn't reflow
 * under your thumb as you move the other bound.
 */
function RangePicker({
  scale,
  customGrades,
  min,
  max,
  onChange,
}: {
  scale: MatchGradingScale;
  customGrades: readonly CustomGradeEntry[];
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const all = gradeOptions(scale, { customGrades });
  const count = max - min + 1;

  const options = (bound: "min" | "max"): GradeChoice<number>[] =>
    all.map((o) => ({
      value: o.value,
      label: o.label,
      disabled: bound === "min" ? o.value > max : o.value < min,
    }));

  return (
    <div className={styles.rangePicker}>
      <div className={styles.rangeRow}>
        <span className={styles.rangeLabel}>Easiest</span>
        <GradePicker<number>
          options={options("min")}
          value={min}
          onChange={(next) => onChange(next, max)}
          ariaLabel="Easiest grade"
        />
      </div>
      <div className={styles.rangeRow}>
        <span className={styles.rangeLabel}>Hardest</span>
        <GradePicker<number>
          options={options("max")}
          value={max}
          onChange={(next) => onChange(min, next)}
          ariaLabel="Hardest grade"
        />
      </div>
      <p className={styles.rangeSummary}>
        {all.find((o) => o.value === min)?.label} –{" "}
        {all.find((o) => o.value === max)?.label} · {countOf(count, "grade")}
      </p>
    </div>
  );
}

