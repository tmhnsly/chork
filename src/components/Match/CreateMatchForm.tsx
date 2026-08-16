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
  SegmentedControl,
  TabPills,
  ToggleRow,
  showToast,
} from "@/components/ui";
import {
  gradeLabels,
  SCALE_HARD_MAX,
  SCALE_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
  DISCIPLINE_SCALES,
  type Discipline,
} from "@/lib/data/grade-label";
import type { MatchGradingScale, SavedScale } from "@/lib/data/match-types";
import { createMatchAction, setMatchGameMode } from "@/app/match/actions";
import { countOf } from "@/lib/plural";
import type { TabPillOption } from "@/components/ui/TabPills";
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
        <SegmentedControl<"points" | "chork">
          options={[
            { value: "points", label: "Points" },
            { value: "chork", label: "Chork" },
          ]}
          value={gameMode}
          onChange={(next) => dispatch({ type: "set-game-mode", value: next })}
          ariaLabel="Game mode"
        />
        <p className={styles.scaleHint}>
          {gameMode === "chork"
            ? "HORSE, on a wall. Set a route and send it — everyone else "
              + "gets as many goes as you took. Miss and you take a letter; "
              + "spell CHORK and you're out."
            : "Every send scores. Most points wins."}
        </p>
      </fieldset>

      {/* Discipline next — it decides which scales are on offer. */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Discipline</legend>
        <SegmentedControl<Discipline>
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
        <SegmentedControl<ScaleTab>
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
            labels={gradeLabels(scale, SCALE_HARD_MAX[scale])}
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
 * Apple-iOS Settings-style grouped range card. Two stepper rows
 * (easiest / hardest), one hairline between them, both sharing the
 * same surface so the picker reads as a single "range" control.
 *
 * Earlier this surface was 58 separate pills across two TabPills
 * rows — every grade as its own dot. Visually overwhelming for a
 * value the climber actually thinks about as "from X to Y." The
 * stepper holds the same data with two big readable numbers and a
 * ◀ ▶ pair, and the disabled-state logic keeps the range valid
 * without the picker drawing every option.
 */
/**
 * Pick the range with the same pills the log and add-route sheets
 * use, rather than a pair of steppers.
 *
 * The steppers were one tap per grade — eight taps to open a V0–V8
 * Set — and they looked nothing like the picker a climber meets
 * everywhere else in the app. Two labelled rows keep it unambiguous
 * (a single row where you tap two ends is fewer controls but you have
 * to be told how it works), and the impossible half of each row is
 * disabled rather than hidden, so the range reads as a range.
 */
function RangePicker({
  labels,
  min,
  max,
  onChange,
}: {
  labels: string[];
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const count = max - min + 1;
  const options = (bound: "min" | "max"): TabPillOption<number>[] =>
    labels.map((label, value) => ({
      value,
      label,
      disabled: bound === "min" ? value > max : value < min,
    }));

  return (
    <div className={styles.rangePicker}>
      <div className={styles.rangeRow}>
        <span className={styles.rangeLabel}>Easiest</span>
        <TabPills<number>
          options={options("min")}
          value={min}
          onChange={(next) => onChange(next, max)}
          ariaLabel="Easiest grade"
        />
      </div>
      <div className={styles.rangeRow}>
        <span className={styles.rangeLabel}>Hardest</span>
        <TabPills<number>
          options={options("max")}
          value={max}
          onChange={(next) => onChange(min, next)}
          ariaLabel="Hardest grade"
        />
      </div>
      <p className={styles.rangeSummary}>
        {countOf(count, "grade")} in range
      </p>
    </div>
  );
}

