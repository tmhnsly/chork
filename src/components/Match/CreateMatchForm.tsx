"use client";

import { useReducer, useRef, useState, useTransition } from "react";
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
  ToggleRow,
  showToast,
} from "@/components/ui";
import {
  SCALE_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
  DISCIPLINE_SCALES,
  disciplineFamily,
  type Discipline,
} from "@/lib/data/grade-label";
import type { MatchGradingScale, SavedScale } from "@/lib/data/match-types";
import { createMatchAction, setMatchGameMode } from "@/app/match/actions";
import { countOf } from "@/lib/plural";
import {
  buildCreateMatchPayload,
  canSubmit as deriveCanSubmit,
  createMatchReducer,
  isFormulaScale,
  initialCreateMatchState,
  MAX_CUSTOM_GRADES,
  type CreateMatchPrefill,
  type FormulaScale,
} from "./createMatchReducer";
import styles from "./createMatchForm.module.scss";

interface Props {
  savedScales: SavedScale[];
  /** Present when starting a week of a League. */
  league?: { id: string; name: string; weekNumber: number; prefill: CreateMatchPrefill };
}

type ScaleTab = MatchGradingScale;

/**
 * The discipline question, as climbers ask it. "Mixed" is not a
 * `Discipline` in the database — underneath it is the primary
 * discipline plus an alternate ladder, exactly as before — but it
 * belongs in this list, because "am I climbing boulders, ropes, or
 * both today" is one question, and asking it separately further down
 * the form was a whole extra section for a yes/no.
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

export function CreateMatchForm({ savedScales, league }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // All form state lives in the pure reducer — `scale` is the
  // state-machine key, and canSubmit / the submit payload derive
  // from state in ONE place (createMatchReducer.ts).
  const [state, dispatch] = useReducer(
    createMatchReducer,
    league?.prefill,
    initialCreateMatchState,
  );
  const {
    name,
    location,
    discipline,
  gameMode,
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

  const canSubmit = deriveCanSubmit(state, pending);

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
      // The scale tiles sit directly below, so the move is visible.
      if (!isFormulaScale(scale)) {
        dispatch({ type: "set-scale", scale: DISCIPLINE_SCALES[discipline][0] });
      }
      dispatch({ type: "set-mixed", value: true });
      return;
    }
    dispatch({ type: "set-discipline", discipline: next });
    dispatch({ type: "set-mixed", value: false });
  }

  // ── The wizard ──────────────────────────────────
  // Three steps: what you're playing, how it's graded, then a review
  // that reads back the match before it exists. One decision per
  // screen — the single-page version put eight sections of equal
  // weight in one scroll and read as homework. All state stays in the
  // one reducer; the step is purely which slice is on screen, so Back
  // never loses anything.
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0);
  const formRef = useRef<HTMLFormElement>(null);
  function goTo(step: 0 | 1 | 2) {
    setWizardStep(step);
    formRef.current?.scrollIntoView({ block: "start" });
  }
  // Step 1 is optional details; step 2 must describe a valid match
  // before the review will show it. `pending` is a submit concern,
  // not a navigation one.
  const gradesComplete = deriveCanSubmit(state, false);

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
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
      {league && (
        <p className={styles.leagueNote}>
          Week {league.weekNumber} of <strong>{league.name}</strong> — settings carried over from last week.
        </p>
      )}

      <header className={styles.stepsHeader}>
        <span className={styles.dots} aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={styles.dot}
              data-active={i === wizardStep || undefined}
              data-done={i < wizardStep || undefined}
            />
          ))}
        </span>
        <span className={styles.stepCaption}>
          Step {wizardStep + 1} of 3 · {["The game", "The grades", "Review"][wizardStep]}
        </span>
      </header>

      {wizardStep === 0 && (
        <div className={styles.step} key={0}>
          <h2 className={styles.question}>What are you playing?</h2>
          <ChoiceTiles<"points" | "chork">
            options={[
              { value: "points", label: "Points", detail: "Most points wins" },
              { value: "chork", label: "Chork", detail: "Miss and take a letter" },
            ]}
            value={gameMode}
            onChange={(next) => dispatch({ type: "set-game-mode", value: next })}
            ariaLabel="Game mode"
          />
          {gameMode === "chork" && (
            <p className={styles.hint}>
              Set a route and send it — everyone else gets as many goes as
              you took. Spell CHORK and you&rsquo;re out.
            </p>
          )}

          {/* Optional, and shown as optional: a match with no name is
              a perfectly good match. */}
          <div className={styles.optional}>
            <span className={styles.optionalLabel}>Details — optional</span>
            <input
              type="text"
              className={styles.input}
              value={name}
              maxLength={80}
              placeholder="Name it, e.g. Friday sesh"
              aria-label="Match name"
              onChange={(e) => dispatch({ type: "set-name", value: e.target.value })}
            />
            <input
              type="text"
              className={styles.input}
              value={location}
              maxLength={120}
              placeholder="Where, e.g. Fontainebleau"
              aria-label="Location"
              onChange={(e) =>
                dispatch({ type: "set-location", value: e.target.value })
              }
            />
          </div>
        </div>
      )}

      {wizardStep === 1 && (
        <div className={styles.step} key={1}>
          <h2 className={styles.question}>What are you climbing?</h2>
          {/* Mixed is a fourth DISCIPLINE here rather than a separate
              "one scale or two" question further down. It is the same
              state underneath — a primary discipline plus an alternate
              ladder — but as a question it is the one climbers
              actually ask themselves, and it removes a whole section. */}
          <ChoiceTiles<DisciplineChoice>
            options={DISCIPLINE_CHOICES}
            value={disciplineChoice}
            onChange={chooseDiscipline}
            ariaLabel="Discipline"
          />

          <h2 className={styles.question}>
            {isMixed ? ownFamilyLabel : "How are they graded?"}
          </h2>
          {/* On a mixed day only the formula scales are offered:
              picking custom or points would silently drop the second
              ladder (the reducer has nowhere to keep it). */}
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
                options={altScaleChoices.map((value) => ({
                  value,
                  label: SCALE_LABEL[value],
                }))}
                value={altScale}
                onChange={(next) => dispatch({ type: "set-alt-scale", scale: next })}
                ariaLabel={otherFamilyLabel}
              />
            </>
          )}

          {/* Only on a graded scale — a handicap measures a send
              against a grade, and points has none while a custom
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
                    detail="Reuse it next match without re-entering the grades."
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
        </div>
      )}

      {wizardStep === 2 && (
        <div className={styles.step} key={2}>
          <h2 className={styles.question}>Ready?</h2>
          {/* The match read back as the thing it is about to become,
              not as a list of the fields that made it. Every row
              jumps to the step that owns it. */}
          <div className={styles.ticket}>
            <span className={styles.ticketName}>
              {name.trim() || "Unnamed match"}
            </span>
            <span className={styles.ticketMode}>
              {gameMode === "chork" ? "Chork" : "Points"}
              {location.trim() ? ` · ${location.trim()}` : ""}
            </span>
            <dl className={styles.review}>
              <ReviewRow
                term="Climbing"
                value={
                  isMixed
                    ? "Boulders and ropes"
                    : DISCIPLINE_LABEL[discipline]
                }
                onEdit={() => goTo(1)}
              />
              <ReviewRow term="Grades" value={describeScale(state)} onEdit={() => goTo(1)} />
              {isFormulaScale(scale) && (
                <ReviewRow
                  term="Handicap"
                  value={handicap ? "On" : "Off"}
                  muted={!handicap}
                  onEdit={() => goTo(1)}
                />
              )}
            </dl>
          </div>
          <p className={styles.hint}>
            Add routes once you&rsquo;re in — each one takes its own grade.
          </p>
        </div>
      )}

      <div className={styles.stepNav}>
        {wizardStep > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => goTo((wizardStep - 1) as 0 | 1)}
          >
            Back
          </Button>
        ) : (
          <span />
        )}
        {wizardStep < 2 ? (
          <Button
            type="button"
            onClick={() => goTo((wizardStep + 1) as 1 | 2)}
            disabled={wizardStep === 1 && !gradesComplete}
          >
            Next
          </Button>
        ) : (
          <Button type="submit" disabled={!canSubmit} loading={pending}>
            Start match
          </Button>
        )}
      </div>
    </form>
  );
}

/** One line of the review — a term, its value, and the step it edits. */
function ReviewRow({
  term,
  value,
  muted,
  onEdit,
}: {
  term: string;
  value: string;
  muted?: boolean;
  onEdit: () => void;
}) {
  return (
    <div className={styles.reviewRow}>
      <dt className={styles.reviewTerm}>{term}</dt>
      <dd className={`${styles.reviewValue} ${muted ? styles.reviewMuted : ""}`}>
        {value}
      </dd>
      <Button type="button" variant="ghost" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

/** "V-scale", "Custom · 6 grades", "Points only" — and both ladders
 *  when it's a mixed day. Ranges are gone: a grade is chosen per
 *  route now, so there is no band to report. */
function describeScale(state: Parameters<typeof buildCreateMatchPayload>[0]): string {
  const { scale, customGrades, altScale } = state;
  if (scale === "points") return "Points only — no grades";
  if (scale === "custom") return `Custom · ${countOf(customGrades.length, "grade")}`;
  const primary = SCALE_LABEL[scale];
  return altScale ? `${primary} and ${SCALE_LABEL[altScale]}` : primary;
}
