import { describe, expect, it } from "vitest";
import {
  buildCreateJamPayload,
  canSubmit,
  createJamReducer,
  initialCreateJamState,
  MAX_CUSTOM_GRADES,
  type CreateJamAction,
  type CreateJamState,
} from "./createJamReducer";
import type { SavedScale } from "@/lib/data/jam-types";

function mkSavedScale(overrides: Partial<SavedScale> = {}): SavedScale {
  return {
    id: "scale-1",
    name: "The garage board",
    grades: [
      { ordinal: 0, label: "Green" },
      { ordinal: 1, label: "Blue" },
      { ordinal: 2, label: "Red" },
    ],
    created_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

/** Fold a list of actions over the initial state. */
function run(actions: CreateJamAction[], from?: CreateJamState): CreateJamState {
  return actions.reduce(createJamReducer, from ?? initialCreateJamState());
}

describe("initialCreateJamState", () => {
  it("starts on the V scale with the common default ranges", () => {
    const state = initialCreateJamState();
    expect(state.scale).toBe("v");
    expect(state.vRange).toEqual([0, 8]);
    expect(state.fontRange).toEqual([0, 10]);
    expect(state.customGrades).toEqual([]);
    expect(state.saveScale).toBe(false);
  });
});

describe("set-scale (state-machine key)", () => {
  it("switches the scale", () => {
    const state = run([{ type: "set-scale", scale: "points" }]);
    expect(state.scale).toBe("points");
  });

  it("preserves the V range across a round-trip through custom", () => {
    const state = run([
      { type: "set-v-range", min: 2, max: 6 },
      { type: "set-scale", scale: "custom" },
      { type: "set-scale", scale: "v" },
    ]);
    expect(state.vRange).toEqual([2, 6]);
  });

  it("preserves custom grades + scratch when switching away and back", () => {
    const state = run([
      { type: "set-scale", scale: "custom" },
      { type: "set-new-grade-input", value: "Red Circuit" },
      { type: "add-grade" },
      { type: "set-save-scale", value: true },
      { type: "set-scale-name", value: "Comp wall" },
      { type: "set-scale", scale: "font" },
      { type: "set-scale", scale: "custom" },
    ]);
    expect(state.customGrades).toEqual(["Red Circuit"]);
    expect(state.saveScale).toBe(true);
    expect(state.scaleName).toBe("Comp wall");
  });

  it("keeps font and V ranges independent", () => {
    const state = run([
      { type: "set-v-range", min: 1, max: 4 },
      { type: "set-font-range", min: 3, max: 9 },
    ]);
    expect(state.vRange).toEqual([1, 4]);
    expect(state.fontRange).toEqual([3, 9]);
  });
});

describe("custom grade list editing", () => {
  it("add-grade trims the input, appends, and clears the scratch", () => {
    const state = run([
      { type: "set-new-grade-input", value: "  Yellow  " },
      { type: "add-grade" },
    ]);
    expect(state.customGrades).toEqual(["Yellow"]);
    expect(state.newGradeInput).toBe("");
  });

  it("add-grade is a no-op on empty / whitespace-only input", () => {
    const state = run([
      { type: "set-new-grade-input", value: "   " },
      { type: "add-grade" },
    ]);
    expect(state.customGrades).toEqual([]);
  });

  it("add-grade is a no-op at the MAX_CUSTOM_GRADES cap", () => {
    const full: CreateJamState = {
      ...initialCreateJamState(),
      customGrades: Array.from({ length: MAX_CUSTOM_GRADES }, (_, i) => `g${i}`),
      newGradeInput: "one too many",
    };
    const next = createJamReducer(full, { type: "add-grade" });
    expect(next.customGrades).toHaveLength(MAX_CUSTOM_GRADES);
    // Input is kept so the climber doesn't lose what they typed.
    expect(next.newGradeInput).toBe("one too many");
  });

  it("remove-grade drops exactly the targeted index", () => {
    const state = run(
      [{ type: "remove-grade", index: 1 }],
      { ...initialCreateJamState(), customGrades: ["a", "b", "c"] },
    );
    expect(state.customGrades).toEqual(["a", "c"]);
  });

  it("move-grade swaps adjacent entries", () => {
    const base = { ...initialCreateJamState(), customGrades: ["a", "b", "c"] };
    expect(
      createJamReducer(base, { type: "move-grade", index: 0, delta: 1 })
        .customGrades,
    ).toEqual(["b", "a", "c"]);
    expect(
      createJamReducer(base, { type: "move-grade", index: 2, delta: -1 })
        .customGrades,
    ).toEqual(["a", "c", "b"]);
  });

  it("move-grade out of bounds is a no-op (same reference)", () => {
    const base = { ...initialCreateJamState(), customGrades: ["a", "b"] };
    expect(createJamReducer(base, { type: "move-grade", index: 0, delta: -1 }))
      .toBe(base);
    expect(createJamReducer(base, { type: "move-grade", index: 1, delta: 1 }))
      .toBe(base);
  });
});

describe("apply-saved-scale (atomicity)", () => {
  it("replaces grades, adopts the name, and switches save-scale OFF in one step", () => {
    const dirty: CreateJamState = {
      ...initialCreateJamState(),
      scale: "custom",
      customGrades: ["Old A", "Old B"],
      saveScale: true,
      scaleName: "half-typed",
    };
    const next = createJamReducer(dirty, {
      type: "apply-saved-scale",
      saved: mkSavedScale(),
    });
    expect(next.customGrades).toEqual(["Green", "Blue", "Red"]);
    expect(next.scaleName).toBe("The garage board");
    expect(next.saveScale).toBe(false);
  });

  it("preserves grade order from the saved scale", () => {
    const next = createJamReducer(initialCreateJamState(), {
      type: "apply-saved-scale",
      saved: mkSavedScale({
        grades: [
          { ordinal: 0, label: "Easy" },
          { ordinal: 1, label: "Mid" },
          { ordinal: 2, label: "Hard" },
        ],
      }),
    });
    expect(next.customGrades).toEqual(["Easy", "Mid", "Hard"]);
  });
});

describe("canSubmit truth table", () => {
  const base = initialCreateJamState();

  it("pending always blocks submission", () => {
    expect(canSubmit(base, true)).toBe(false);
    expect(canSubmit({ ...base, scale: "points" }, true)).toBe(false);
  });

  it("v / font / points submit with no extra validation", () => {
    expect(canSubmit({ ...base, scale: "v" }, false)).toBe(true);
    expect(canSubmit({ ...base, scale: "font" }, false)).toBe(true);
    expect(canSubmit({ ...base, scale: "points" }, false)).toBe(true);
  });

  it("custom needs at least one grade", () => {
    const custom: CreateJamState = { ...base, scale: "custom" };
    expect(canSubmit(custom, false)).toBe(false);
    expect(canSubmit({ ...custom, customGrades: ["Red"] }, false)).toBe(true);
  });

  it("custom validity ignores grades parked under another scale", () => {
    // Grades linger from a previous visit to the custom tab, but the
    // active scale is V — submission must not be gated on them.
    const state: CreateJamState = { ...base, scale: "v", customGrades: [] };
    expect(canSubmit(state, false)).toBe(true);
  });
});

describe("buildCreateJamPayload per scale", () => {
  it("v — sends the V range, nulls custom fields", () => {
    const state: CreateJamState = {
      ...initialCreateJamState(),
      scale: "v",
      vRange: [2, 7],
      fontRange: [1, 5],
      customGrades: ["stale"],
      saveScale: true,
      scaleName: "stale name",
    };
    expect(buildCreateJamPayload(state)).toEqual({
      name: null,
      location: null,
      gradingScale: "v",
      minGrade: 2,
      maxGrade: 7,
      customGrades: null,
      saveScaleName: null,
    });
  });

  it("font — sends the Font range, not the V range", () => {
    const state: CreateJamState = {
      ...initialCreateJamState(),
      scale: "font",
      vRange: [2, 7],
      fontRange: [1, 5],
    };
    const payload = buildCreateJamPayload(state);
    expect(payload.minGrade).toBe(1);
    expect(payload.maxGrade).toBe(5);
  });

  it("custom — sends grades, nulls the range", () => {
    const state: CreateJamState = {
      ...initialCreateJamState(),
      scale: "custom",
      customGrades: ["Green", "Red"],
    };
    const payload = buildCreateJamPayload(state);
    expect(payload.gradingScale).toBe("custom");
    expect(payload.minGrade).toBeNull();
    expect(payload.maxGrade).toBeNull();
    expect(payload.customGrades).toEqual(["Green", "Red"]);
  });

  it("points — everything scale-specific nulls out", () => {
    const state: CreateJamState = {
      ...initialCreateJamState(),
      scale: "points",
      customGrades: ["stale"],
    };
    expect(buildCreateJamPayload(state)).toEqual({
      name: null,
      location: null,
      gradingScale: "points",
      minGrade: null,
      maxGrade: null,
      customGrades: null,
      saveScaleName: null,
    });
  });

  it("trims name + location, mapping empty to null", () => {
    const state: CreateJamState = {
      ...initialCreateJamState(),
      name: "  Friday sesh  ",
      location: "   ",
    };
    const payload = buildCreateJamPayload(state);
    expect(payload.name).toBe("Friday sesh");
    expect(payload.location).toBeNull();
  });

  describe("saveScaleName ladder (custom only)", () => {
    const custom: CreateJamState = {
      ...initialCreateJamState(),
      scale: "custom",
      customGrades: ["Green"],
    };

    it("null when save-scale is off", () => {
      const state = { ...custom, saveScale: false, scaleName: "Board" };
      expect(buildCreateJamPayload(state).saveScaleName).toBeNull();
    });

    it("null when the name is blank", () => {
      const state = { ...custom, saveScale: true, scaleName: "   " };
      expect(buildCreateJamPayload(state).saveScaleName).toBeNull();
    });

    it("trimmed name when save-scale is on", () => {
      const state = { ...custom, saveScale: true, scaleName: "  Board  " };
      expect(buildCreateJamPayload(state).saveScaleName).toBe("Board");
    });

    it("null on non-custom scales even when toggled on", () => {
      const state: CreateJamState = {
        ...custom,
        scale: "v",
        saveScale: true,
        scaleName: "Board",
      };
      expect(buildCreateJamPayload(state).saveScaleName).toBeNull();
    });
  });
});
