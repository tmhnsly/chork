import type { MatchGradingScale, SavedScale } from "@/lib/data/match-types";
import {
  DISCIPLINE_SCALES,
  SCALE_DEFAULT_MAX,
  type Discipline,
  scaleFamily,
} from "@/lib/data/grade-label";

/**
 * Local state model for the create-match form. Modelled on
 * `matchScreenReducer.ts` — discriminated-union actions, pure
 * transitions, immutable updates. Unit-tested independently of any
 * React render.
 *
 * Split rationale: `scale` is a tiny state machine — it gates which
 * of ranges / customGrades / saveScale / scaleName are
 * live — but the form held all of them as nine loose useStates, and
 * the "which fields matter for this scale" invariant was re-encoded
 * three times (canSubmit, submit payload assembly, JSX conditionals).
 * The reducer keys everything on `scale`, `applySavedScale` becomes
 * one atomic action, and `canSubmit` + the submit payload derive from
 * state in exactly one place each (`canSubmit()` /
 * `buildCreateMatchPayload()` below).
 *
 * Per-scale data survives scale switches on purpose — flipping
 * V → Custom → V keeps the previously picked V range, matching the
 * old loose-useState behaviour. Fields that don't belong to the
 * active scale are simply ignored by the derivations.
 */

export const MAX_CUSTOM_GRADES = 50;

/**
 * Scales that take a numeric [min, max]. `custom` carries its own
 * ladder and `points` has no grades, so neither has a range.
 */
export type FormulaScale = "v" | "font" | "yds" | "french";

export function isFormulaScale(
  scale: MatchGradingScale,
): scale is FormulaScale {
  return (
    scale === "v" || scale === "font" || scale === "yds" || scale === "french"
  );
}

export interface CreateMatchState {
  name: string;
  location: string;
  /** The state-machine key — gates which fields below are live. */
  scale: MatchGradingScale;

  /** Which discipline this Match defaults to. Gates `scale`. */
  discipline: Discipline;

  /**
   * Score relative to each player's own ceiling, so climbers of
   * different grades share a board honestly. Needs a graded scale —
   * `points` has no grades and a custom ladder's ordinals aren't a
   * difficulty scale, so the toggle is hidden on those.
   */
  handicap: boolean;
  gameMode: "points" | "chork";

  /**
   * Numeric [min, max] index into the grade-label table, one per
   * formula scale. A map rather than a field each: there were two
   * scales and are now four, and "remember what they picked on the
   * other scale" is one rule, not N.
   */
  ranges: Record<FormulaScale, [number, number]>;

  /**
   * The scale for the OTHER discipline family — set on a mixed day, so
   * boulders and ropes can both be graded in one Match (migration
   * 117). Null is a single-discipline session.
   *
   * Its range lives in `ranges` like any other, which is exactly why
   * that is a map: the alt needs one too, and a second bespoke pair of
   * fields would be the same rule written twice.
   */
  altScale: FormulaScale | null;

  // custom — ordered easiest → hardest, plus its editing scratch.
  customGrades: string[];
  newGradeInput: string;
  saveScale: boolean;
  scaleName: string;
}

export type CreateMatchAction =
  | { type: "set-name"; value: string }
  | { type: "set-location"; value: string }
  | { type: "set-scale"; scale: MatchGradingScale }
  /**
   * Switching discipline re-points `scale` when the current one
   * doesn't belong to the new discipline — you cannot grade a rope
   * in V. `points` and `custom` suit any discipline and are left
   * alone, so someone mid-way through building a custom ladder
   * doesn't lose it by changing discipline.
   */
  | { type: "set-discipline"; discipline: Discipline }
  | { type: "set-handicap"; value: boolean }
  | { type: "set-game-mode"; value: "points" | "chork" }
  | { type: "set-range"; scale: FormulaScale; min: number; max: number }
  /**
   * Turn a mixed day on or off. On picks the other family's default
   * scale; off drops it. The ranges stay put either way, so toggling
   * twice doesn't lose what was set.
   */
  | { type: "set-mixed"; value: boolean }
  | { type: "set-alt-scale"; scale: FormulaScale }
  /**
   * Commit the pending grade input onto the list and clear the
   * input. No-op when the trimmed input is empty or the list is at
   * MAX_CUSTOM_GRADES (the orchestrator toasts before dispatching).
   */
  | { type: "add-grade" }
  | { type: "remove-grade"; index: number }
  | { type: "move-grade"; index: number; delta: number }
  /**
   * Atomically load a saved scale: replaces the grade list, adopts
   * the saved name, and switches "save this scale" OFF (it already
   * exists — resaving under the same name would be a duplicate).
   */
  | { type: "apply-saved-scale"; saved: SavedScale }
  | { type: "set-new-grade-input"; value: string }
  | { type: "set-save-scale"; value: boolean }
  | { type: "set-scale-name"; value: string };

/**
 * Defaults: V0→V8 / Font 3→7A — common ranges so climbers can move
 * on without thinking.
 */
export function initialCreateMatchState(): CreateMatchState {
  return {
    name: "",
    location: "",
    discipline: "boulder",
    handicap: false,
    gameMode: "points",
    scale: "v",
    ranges: {
      v: [0, 8],
      font: [0, 10],
      // Ropes start at the bottom of each scale and run to a common
      // gym top-end, same reasoning as the boulder defaults.
      yds: [0, SCALE_DEFAULT_MAX.yds],
      french: [0, SCALE_DEFAULT_MAX.french],
    },
    altScale: null,
    customGrades: [],
    newGradeInput: "",
    saveScale: false,
    scaleName: "",
  };
}

/** The scale a mixed day reaches for by default, given the primary. */
function defaultAltScale(scale: MatchGradingScale): FormulaScale {
  return scaleFamily(scale) === "boulder" ? "french" : "v";
}

export function createMatchReducer(
  state: CreateMatchState,
  action: CreateMatchAction,
): CreateMatchState {
  switch (action.type) {
    case "set-name":
      return { ...state, name: action.value };

    case "set-location":
      return { ...state, location: action.value };

    case "set-scale": {
      // A handicap needs grades to measure against, so switching to a
      // scale that has none turns it off rather than leaving a toggle
      // that silently does nothing.
      const keepsHandicap = isFormulaScale(action.scale);
      // Only a formula scale has a family, so switching to custom or
      // points drops the mixed setup: one ladder covers everything,
      // and points has no grades to mix in the first place.
      const keepsAlt = isFormulaScale(action.scale) && state.altScale !== null;
      return {
        ...state,
        scale: action.scale,
        handicap: keepsHandicap && state.handicap,
        altScale: keepsAlt
          ? scaleFamily(state.altScale!) === scaleFamily(action.scale)
            ? defaultAltScale(action.scale)
            : state.altScale
          : null,
      };
    }

    case "set-game-mode":
      return { ...state, gameMode: action.value };

    case "set-handicap":
      return { ...state, handicap: action.value && isFormulaScale(state.scale) };

    case "set-discipline": {
      if (action.discipline === state.discipline) return state;
      const allowed = DISCIPLINE_SCALES[action.discipline];
      // `points` / `custom` suit any discipline — only a formula
      // scale can belong to the wrong one.
      const keepScale =
        !isFormulaScale(state.scale)
        || (allowed as readonly MatchGradingScale[]).includes(state.scale);
      const nextScale = keepScale ? state.scale : allowed[0];
      // Switching a bouldering Match to Sport flips which family is
      // "other" — the rope alt it was carrying is now the primary
      // family, so the alt has to move to boulders or it is the same
      // scale twice and every route resolves to whichever is read
      // first. The server refuses that shape outright (migration 117).
      const nextAlt =
        state.altScale === null || !isFormulaScale(nextScale)
          ? null
          : scaleFamily(state.altScale) === scaleFamily(nextScale)
            ? defaultAltScale(nextScale)
            : state.altScale;
      return {
        ...state,
        discipline: action.discipline,
        scale: nextScale,
        altScale: nextAlt,
      };
    }

    case "set-mixed": {
      if (!action.value) return { ...state, altScale: null };
      // Meaningless without two ladders to mix.
      if (!isFormulaScale(state.scale)) return state;
      return { ...state, altScale: defaultAltScale(state.scale) };
    }

    case "set-alt-scale": {
      // Guard the invariant here as well as at the call site: an alt
      // in the primary's own family is not a second scale.
      if (scaleFamily(action.scale) === scaleFamily(state.scale)) return state;
      return { ...state, altScale: action.scale };
    }

    case "set-range":
      return {
        ...state,
        ranges: {
          ...state.ranges,
          [action.scale]: [action.min, action.max],
        },
      };

    case "add-grade": {
      const label = state.newGradeInput.trim();
      if (!label) return state;
      if (state.customGrades.length >= MAX_CUSTOM_GRADES) return state;
      return {
        ...state,
        customGrades: [...state.customGrades, label],
        newGradeInput: "",
      };
    }

    case "remove-grade":
      return {
        ...state,
        customGrades: state.customGrades.filter((_, i) => i !== action.index),
      };

    case "move-grade": {
      const target = action.index + action.delta;
      if (
        action.index < 0 ||
        action.index >= state.customGrades.length ||
        target < 0 ||
        target >= state.customGrades.length
      ) {
        return state;
      }
      const next = [...state.customGrades];
      [next[action.index], next[target]] = [next[target], next[action.index]];
      return { ...state, customGrades: next };
    }

    case "apply-saved-scale":
      return {
        ...state,
        customGrades: action.saved.grades.map((g) => g.label),
        scaleName: action.saved.name,
        saveScale: false,
      };

    case "set-new-grade-input":
      return { ...state, newGradeInput: action.value };

    case "set-save-scale":
      return { ...state, saveScale: action.value };

    case "set-scale-name":
      return { ...state, scaleName: action.value };

    default: {
      // Exhaustiveness check — TS errors if a new action type is
      // added without a matching case.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ── Derivations — the single home of the per-scale invariant ──

/**
 * Whether the form may submit. Custom needs at least one grade;
 * v / font / points have no extra validation beyond the pickers.
 */
export function canSubmit(state: CreateMatchState, pending: boolean): boolean {
  if (pending) return false;
  if (state.scale === "custom") return state.customGrades.length > 0;
  return true;
}

/** Shape handed to `createMatchAction` — structurally matches its payload. */
export interface CreateMatchFormPayload {
  name: string | null;
  location: string | null;
  discipline: Discipline;
  handicap: boolean;
  gradingScale: MatchGradingScale;
  minGrade: number | null;
  maxGrade: number | null;
  customGrades: string[] | null;
  saveScaleName: string | null;
  /**
   * Applied after creation via `setMatchGameMode`, not by
   * `create_match` — see the note on that action.
   */
  gameMode: "points" | "chork";
  /** Null on a single-discipline day. */
  altGradingScale: FormulaScale | null;
  altMinGrade: number | null;
  altMaxGrade: number | null;
}

/**
 * Assemble the server-action payload from state — only the fields
 * that belong to the active scale are sent; everything else nulls.
 */
export function buildCreateMatchPayload(
  state: CreateMatchState,
): CreateMatchFormPayload {
  const range = isFormulaScale(state.scale) ? state.ranges[state.scale] : null;
  const altRange = state.altScale ? state.ranges[state.altScale] : null;
  return {
    name: state.name.trim() || null,
    location: state.location.trim() || null,
    discipline: state.discipline,
    handicap: state.handicap,
    gameMode: state.gameMode,
    gradingScale: state.scale,
    minGrade: range ? range[0] : null,
    maxGrade: range ? range[1] : null,
    customGrades: state.scale === "custom" ? state.customGrades : null,
    saveScaleName:
      state.scale === "custom" && state.saveScale && state.scaleName.trim()
        ? state.scaleName.trim()
        : null,
    altGradingScale: state.altScale,
    altMinGrade: altRange ? altRange[0] : null,
    altMaxGrade: altRange ? altRange[1] : null,
  };
}
