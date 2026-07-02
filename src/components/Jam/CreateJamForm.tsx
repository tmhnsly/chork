"use client";

import { useReducer, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FaPlus,
  FaXmark,
  FaArrowUp,
  FaArrowDown,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa6";
import {
  Button,
  SegmentedControl,
  ToggleRow,
  showToast,
} from "@/components/ui";
import { gradeLabels } from "@/lib/data/grade-label";
import type { JamGradingScale, SavedScale } from "@/lib/data/jam-types";
import { createJamAction } from "@/app/jam/actions";
import { JAM_SCALE_LABEL } from "./jam-scale-label";
import {
  buildCreateJamPayload,
  canSubmit as deriveCanSubmit,
  createJamReducer,
  initialCreateJamState,
  MAX_CUSTOM_GRADES,
} from "./createJamReducer";
import styles from "./createJamForm.module.scss";

interface Props {
  savedScales: SavedScale[];
}

type ScaleTab = JamGradingScale;

const V_LABELS = gradeLabels("v", 17);
const FONT_LABELS = gradeLabels("font", 21);

const SCALE_OPTIONS: { value: ScaleTab; label: string }[] = [
  { value: "v", label: JAM_SCALE_LABEL.v },
  { value: "font", label: JAM_SCALE_LABEL.font },
  { value: "custom", label: JAM_SCALE_LABEL.custom },
  { value: "points", label: JAM_SCALE_LABEL.points },
];

export function CreateJamForm({ savedScales }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // All form state lives in the pure reducer — `scale` is the
  // state-machine key, and canSubmit / the submit payload derive
  // from state in ONE place (createJamReducer.ts).
  const [state, dispatch] = useReducer(
    createJamReducer,
    undefined,
    initialCreateJamState,
  );
  const {
    name,
    location,
    scale,
    vRange,
    fontRange,
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
      const result = await createJamAction(buildCreateJamPayload(state));
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      router.push(`/jam/${result.id}`);
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

      {/* Scale picker — SegmentedControl across V / Font / Custom / Points */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Grading scale</legend>
        <SegmentedControl<ScaleTab>
          options={SCALE_OPTIONS}
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

      {scale === "v" && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Grade range</legend>
          <RangePicker
            labels={V_LABELS}
            min={vRange[0]}
            max={vRange[1]}
            onChange={(min, max) => dispatch({ type: "set-v-range", min, max })}
          />
        </fieldset>
      )}
      {scale === "font" && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Grade range</legend>
          <RangePicker
            labels={FONT_LABELS}
            min={fontRange[0]}
            max={fontRange[1]}
            onChange={(min, max) =>
              dispatch({ type: "set-font-range", min, max })
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
                detail="Reuse it next jam without re-entering the grades."
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
        {pending ? "Starting jam…" : "Start jam"}
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
  return (
    <div className={styles.rangePicker}>
      <div className={styles.rangeCard}>
        <StepperRow
          label="Easiest"
          value={labels[min] ?? ""}
          canDecrement={min > 0}
          canIncrement={min < max}
          onDecrement={() => onChange(min - 1, max)}
          onIncrement={() => onChange(min + 1, max)}
        />
        <StepperRow
          label="Hardest"
          value={labels[max] ?? ""}
          canDecrement={max > min}
          canIncrement={max < labels.length - 1}
          onDecrement={() => onChange(min, max - 1)}
          onIncrement={() => onChange(min, max + 1)}
        />
      </div>
      <p className={styles.rangeSummary}>
        {count} {count === 1 ? "grade" : "grades"} in range
      </p>
    </div>
  );
}

function StepperRow({
  label,
  value,
  canDecrement,
  canIncrement,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: string;
  canDecrement: boolean;
  canIncrement: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <div className={styles.stepperRow}>
      <span className={styles.stepperLabel}>{label}</span>
      <div className={styles.stepperControl}>
        <button
          type="button"
          className={styles.stepperBtn}
          onClick={onDecrement}
          disabled={!canDecrement}
          aria-label={`Lower ${label.toLowerCase()} grade`}
        >
          <FaChevronLeft aria-hidden />
        </button>
        <span className={styles.stepperValue} aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          className={styles.stepperBtn}
          onClick={onIncrement}
          disabled={!canIncrement}
          aria-label={`Raise ${label.toLowerCase()} grade`}
        >
          <FaChevronRight aria-hidden />
        </button>
      </div>
    </div>
  );
}
