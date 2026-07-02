import type { JamGradingScale, SavedScale } from "@/lib/data/jam-types";

/**
 * Local state model for the create-jam form. Modelled on
 * `jamScreenReducer.ts` — discriminated-union actions, pure
 * transitions, immutable updates. Unit-tested independently of any
 * React render.
 *
 * Split rationale: `scale` is a tiny state machine — it gates which
 * of vRange / fontRange / customGrades / saveScale / scaleName are
 * live — but the form held all of them as nine loose useStates, and
 * the "which fields matter for this scale" invariant was re-encoded
 * three times (canSubmit, submit payload assembly, JSX conditionals).
 * The reducer keys everything on `scale`, `applySavedScale` becomes
 * one atomic action, and `canSubmit` + the submit payload derive from
 * state in exactly one place each (`canSubmit()` /
 * `buildCreateJamPayload()` below).
 *
 * Per-scale data survives scale switches on purpose — flipping
 * V → Custom → V keeps the previously picked V range, matching the
 * old loose-useState behaviour. Fields that don't belong to the
 * active scale are simply ignored by the derivations.
 */

export const MAX_CUSTOM_GRADES = 50;

export interface CreateJamState {
  name: string;
  location: string;
  /** The state-machine key — gates which fields below are live. */
  scale: JamGradingScale;

  // v / font — numeric [min, max] index into the grade-label table.
  vRange: [number, number];
  fontRange: [number, number];

  // custom — ordered easiest → hardest, plus its editing scratch.
  customGrades: string[];
  newGradeInput: string;
  saveScale: boolean;
  scaleName: string;
}

export type CreateJamAction =
  | { type: "set-name"; value: string }
  | { type: "set-location"; value: string }
  | { type: "set-scale"; scale: JamGradingScale }
  | { type: "set-v-range"; min: number; max: number }
  | { type: "set-font-range"; min: number; max: number }
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
export function initialCreateJamState(): CreateJamState {
  return {
    name: "",
    location: "",
    scale: "v",
    vRange: [0, 8],
    fontRange: [0, 10],
    customGrades: [],
    newGradeInput: "",
    saveScale: false,
    scaleName: "",
  };
}

export function createJamReducer(
  state: CreateJamState,
  action: CreateJamAction,
): CreateJamState {
  switch (action.type) {
    case "set-name":
      return { ...state, name: action.value };

    case "set-location":
      return { ...state, location: action.value };

    case "set-scale":
      return { ...state, scale: action.scale };

    case "set-v-range":
      return { ...state, vRange: [action.min, action.max] };

    case "set-font-range":
      return { ...state, fontRange: [action.min, action.max] };

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
export function canSubmit(state: CreateJamState, pending: boolean): boolean {
  if (pending) return false;
  if (state.scale === "custom") return state.customGrades.length > 0;
  return true;
}

/** Shape handed to `createJamAction` — structurally matches its payload. */
export interface CreateJamFormPayload {
  name: string | null;
  location: string | null;
  gradingScale: JamGradingScale;
  minGrade: number | null;
  maxGrade: number | null;
  customGrades: string[] | null;
  saveScaleName: string | null;
}

/**
 * Assemble the server-action payload from state — only the fields
 * that belong to the active scale are sent; everything else nulls.
 */
export function buildCreateJamPayload(
  state: CreateJamState,
): CreateJamFormPayload {
  const range =
    state.scale === "v"
      ? state.vRange
      : state.scale === "font"
        ? state.fontRange
        : null;
  return {
    name: state.name.trim() || null,
    location: state.location.trim() || null,
    gradingScale: state.scale,
    minGrade: range ? range[0] : null,
    maxGrade: range ? range[1] : null,
    customGrades: state.scale === "custom" ? state.customGrades : null,
    saveScaleName:
      state.scale === "custom" && state.saveScale && state.scaleName.trim()
        ? state.scaleName.trim()
        : null,
  };
}
