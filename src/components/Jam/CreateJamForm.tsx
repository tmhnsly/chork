"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaPlus, FaXmark, FaArrowUp, FaArrowDown } from "react-icons/fa6";
import {
  Button,
  SegmentedControl,
  TabPills,
  ToggleRow,
  showToast,
} from "@/components/ui";
import type { TabPillOption } from "@/components/ui";
import { gradeLabels } from "@/lib/data/grade-label";
import type { JamGradingScale, SavedScale } from "@/lib/data/jam-types";
import { createJamAction } from "@/app/jam/actions";
import { JAM_SCALE_LABEL } from "./jam-scale-label";
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

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [scale, setScale] = useState<ScaleTab>("v");

  // V / Font — stored as numeric index. Default to a common range
  // (V0→V8 or 3→7A) so climbers can move on without thinking.
  const [vRange, setVRange] = useState<[number, number]>([0, 8]);
  const [fontRange, setFontRange] = useState<[number, number]>([0, 10]);

  // Custom grades — ordered easiest→hardest. Add via the input, drag-
  // free reorder via the arrow buttons (no library, no drag handlers).
  const [customGrades, setCustomGrades] = useState<string[]>([]);
  const [newGradeInput, setNewGradeInput] = useState("");
  const [saveScale, setSaveScale] = useState(false);
  const [scaleName, setScaleName] = useState("");

  const canSubmit = useMemo(() => {
    if (pending) return false;
    if (scale === "custom") return customGrades.length > 0;
    // v / font / points — no extra validation beyond the picker.
    return true;
  }, [pending, scale, customGrades.length]);

  function addCustomGrade() {
    const label = newGradeInput.trim();
    if (!label) return;
    if (customGrades.length >= 50) {
      showToast("Max 50 grades", "error");
      return;
    }
    setCustomGrades((prev) => [...prev, label]);
    setNewGradeInput("");
  }

  function removeCustomGrade(index: number) {
    setCustomGrades((prev) => prev.filter((_, i) => i !== index));
  }

  function moveCustomGrade(index: number, delta: number) {
    setCustomGrades((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function applySavedScale(saved: SavedScale) {
    setCustomGrades(saved.grades.map((g) => g.label));
    setScaleName(saved.name);
    setSaveScale(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await createJamAction({
        name: name.trim() || null,
        location: location.trim() || null,
        gradingScale: scale,
        minGrade: scale === "v" ? vRange[0] : scale === "font" ? fontRange[0] : null,
        maxGrade: scale === "v" ? vRange[1] : scale === "font" ? fontRange[1] : null,
        customGrades: scale === "custom" ? customGrades : null,
        saveScaleName:
          scale === "custom" && saveScale && scaleName.trim()
            ? scaleName.trim()
            : null,
      });
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
          onChange={(e) => setName(e.target.value)}
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
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>

      {/* Scale picker — SegmentedControl across V / Font / Custom / Points */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Grading scale</legend>
        <SegmentedControl<ScaleTab>
          options={SCALE_OPTIONS}
          value={scale}
          onChange={setScale}
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
        <RangePicker
          labels={V_LABELS}
          min={vRange[0]}
          max={vRange[1]}
          onChange={(min, max) => setVRange([min, max])}
        />
      )}
      {scale === "font" && (
        <RangePicker
          labels={FONT_LABELS}
          min={fontRange[0]}
          max={fontRange[1]}
          onChange={(min, max) => setFontRange([min, max])}
        />
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
                  onClick={() => applySavedScale(s)}
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
              onChange={(e) => setNewGradeInput(e.target.value)}
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
                        onClick={() => moveCustomGrade(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                      >
                        <FaArrowUp aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={styles.gradeIconBtn}
                        onClick={() => moveCustomGrade(i, 1)}
                        disabled={i === customGrades.length - 1}
                        aria-label="Move down"
                      >
                        <FaArrowDown aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={styles.gradeIconBtn}
                        onClick={() => removeCustomGrade(i)}
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
                onChange={setSaveScale}
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
                    onChange={(e) => setScaleName(e.target.value)}
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
 * Two TabPills tracks — one for easiest, one for hardest. Same pill
 * primitive as the grade picker inside JamAddRouteSheet so the create
 * + add flows feel like one design language.
 *
 * Max options below the current min are marked disabled so the picker
 * can't produce an invalid range. Tapping a min above the current max
 * snaps max up to match.
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
  const minOptions: TabPillOption<number>[] = labels.map((label, i) => ({
    value: i,
    label,
  }));
  const maxOptions: TabPillOption<number>[] = labels.map((label, i) => ({
    value: i,
    label,
    disabled: i < min,
  }));

  return (
    <div className={styles.rangePicker}>
      <div className={styles.rangeField}>
        <span className={styles.label}>Easiest</span>
        <TabPills<number>
          options={minOptions}
          value={min}
          onChange={(v) => onChange(v, Math.max(v, max))}
          ariaLabel="Easiest grade"
          layout="wrap"
        />
      </div>
      <div className={styles.rangeField}>
        <span className={styles.label}>Hardest</span>
        <TabPills<number>
          options={maxOptions}
          value={max}
          onChange={(v) => onChange(Math.min(v, min), v)}
          ariaLabel="Hardest grade"
          layout="wrap"
        />
      </div>
    </div>
  );
}
