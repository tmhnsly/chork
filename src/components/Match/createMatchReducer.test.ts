import { describe, expect, it } from "vitest";
import {
  buildCreateMatchPayload,
  canSubmit,
  createMatchReducer,
  initialCreateMatchState,
  MAX_CUSTOM_GRADES,
  type CreateMatchAction,
  type CreateMatchState,
} from "./createMatchReducer";
import type { SavedScale } from "@/lib/data/match-types";

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
function run(actions: CreateMatchAction[], from?: CreateMatchState): CreateMatchState {
  return actions.reduce(createMatchReducer, from ?? initialCreateMatchState());
}

describe("initialCreateMatchState", () => {
  it("starts on the V scale with the common default ranges", () => {
    const state = initialCreateMatchState();
    expect(state.scale).toBe("v");
    expect(state.ranges.v).toEqual([0, 8]);
    expect(state.ranges.font).toEqual([0, 10]);
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
      { type: "set-range", scale: "v", min: 2, max: 6 },
      { type: "set-scale", scale: "custom" },
      { type: "set-scale", scale: "v" },
    ]);
    expect(state.ranges.v).toEqual([2, 6]);
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
      { type: "set-range", scale: "v", min: 1, max: 4 },
      { type: "set-range", scale: "font", min: 3, max: 9 },
    ]);
    expect(state.ranges.v).toEqual([1, 4]);
    expect(state.ranges.font).toEqual([3, 9]);
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
    const full: CreateMatchState = {
      ...initialCreateMatchState(),
      customGrades: Array.from({ length: MAX_CUSTOM_GRADES }, (_, i) => `g${i}`),
      newGradeInput: "one too many",
    };
    const next = createMatchReducer(full, { type: "add-grade" });
    expect(next.customGrades).toHaveLength(MAX_CUSTOM_GRADES);
    // Input is kept so the climber doesn't lose what they typed.
    expect(next.newGradeInput).toBe("one too many");
  });

  it("remove-grade drops exactly the targeted index", () => {
    const state = run(
      [{ type: "remove-grade", index: 1 }],
      { ...initialCreateMatchState(), customGrades: ["a", "b", "c"] },
    );
    expect(state.customGrades).toEqual(["a", "c"]);
  });

  it("move-grade swaps adjacent entries", () => {
    const base = { ...initialCreateMatchState(), customGrades: ["a", "b", "c"] };
    expect(
      createMatchReducer(base, { type: "move-grade", index: 0, delta: 1 })
        .customGrades,
    ).toEqual(["b", "a", "c"]);
    expect(
      createMatchReducer(base, { type: "move-grade", index: 2, delta: -1 })
        .customGrades,
    ).toEqual(["a", "c", "b"]);
  });

  it("move-grade out of bounds is a no-op (same reference)", () => {
    const base = { ...initialCreateMatchState(), customGrades: ["a", "b"] };
    expect(createMatchReducer(base, { type: "move-grade", index: 0, delta: -1 }))
      .toBe(base);
    expect(createMatchReducer(base, { type: "move-grade", index: 1, delta: 1 }))
      .toBe(base);
  });
});

describe("apply-saved-scale (atomicity)", () => {
  it("replaces grades, adopts the name, and switches save-scale OFF in one step", () => {
    const dirty: CreateMatchState = {
      ...initialCreateMatchState(),
      scale: "custom",
      customGrades: ["Old A", "Old B"],
      saveScale: true,
      scaleName: "half-typed",
    };
    const next = createMatchReducer(dirty, {
      type: "apply-saved-scale",
      saved: mkSavedScale(),
    });
    expect(next.customGrades).toEqual(["Green", "Blue", "Red"]);
    expect(next.scaleName).toBe("The garage board");
    expect(next.saveScale).toBe(false);
  });

  it("preserves grade order from the saved scale", () => {
    const next = createMatchReducer(initialCreateMatchState(), {
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
  const base = initialCreateMatchState();

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
    const custom: CreateMatchState = { ...base, scale: "custom" };
    expect(canSubmit(custom, false)).toBe(false);
    expect(canSubmit({ ...custom, customGrades: ["Red"] }, false)).toBe(true);
  });

  it("custom validity ignores grades parked under another scale", () => {
    // Grades linger from a previous visit to the custom tab, but the
    // active scale is V — submission must not be gated on them.
    const state: CreateMatchState = { ...base, scale: "v", customGrades: [] };
    expect(canSubmit(state, false)).toBe(true);
  });
});

describe("buildCreateMatchPayload per scale", () => {
  it("v — sends the V range, nulls custom fields", () => {
    const state: CreateMatchState = {
      ...initialCreateMatchState(),
      scale: "v",
      ranges: { ...initialCreateMatchState().ranges, v: [2, 7], font: [1, 5] },
      customGrades: ["stale"],
      saveScale: true,
      scaleName: "stale name",
    };
    expect(buildCreateMatchPayload(state)).toEqual({
      name: null,
      location: null,
      discipline: "boulder",
      handicap: false,
      gradingScale: "v",
      minGrade: 2,
      maxGrade: 7,
      customGrades: null,
      saveScaleName: null,
    });
  });

  it("font — sends the Font range, not the V range", () => {
    const state: CreateMatchState = {
      ...initialCreateMatchState(),
      scale: "font",
      ranges: { ...initialCreateMatchState().ranges, v: [2, 7], font: [1, 5] },
    };
    const payload = buildCreateMatchPayload(state);
    expect(payload.minGrade).toBe(1);
    expect(payload.maxGrade).toBe(5);
  });

  it("custom — sends grades, nulls the range", () => {
    const state: CreateMatchState = {
      ...initialCreateMatchState(),
      scale: "custom",
      customGrades: ["Green", "Red"],
    };
    const payload = buildCreateMatchPayload(state);
    expect(payload.gradingScale).toBe("custom");
    expect(payload.minGrade).toBeNull();
    expect(payload.maxGrade).toBeNull();
    expect(payload.customGrades).toEqual(["Green", "Red"]);
  });

  it("points — everything scale-specific nulls out", () => {
    const state: CreateMatchState = {
      ...initialCreateMatchState(),
      scale: "points",
      customGrades: ["stale"],
    };
    expect(buildCreateMatchPayload(state)).toEqual({
      name: null,
      location: null,
      discipline: "boulder",
      handicap: false,
      gradingScale: "points",
      minGrade: null,
      maxGrade: null,
      customGrades: null,
      saveScaleName: null,
    });
  });

  it("trims name + location, mapping empty to null", () => {
    const state: CreateMatchState = {
      ...initialCreateMatchState(),
      name: "  Friday sesh  ",
      location: "   ",
    };
    const payload = buildCreateMatchPayload(state);
    expect(payload.name).toBe("Friday sesh");
    expect(payload.location).toBeNull();
  });

  describe("saveScaleName ladder (custom only)", () => {
    const custom: CreateMatchState = {
      ...initialCreateMatchState(),
      scale: "custom",
      customGrades: ["Green"],
    };

    it("null when save-scale is off", () => {
      const state = { ...custom, saveScale: false, scaleName: "Board" };
      expect(buildCreateMatchPayload(state).saveScaleName).toBeNull();
    });

    it("null when the name is blank", () => {
      const state = { ...custom, saveScale: true, scaleName: "   " };
      expect(buildCreateMatchPayload(state).saveScaleName).toBeNull();
    });

    it("trimmed name when save-scale is on", () => {
      const state = { ...custom, saveScale: true, scaleName: "  Board  " };
      expect(buildCreateMatchPayload(state).saveScaleName).toBe("Board");
    });

    it("null on non-custom scales even when toggled on", () => {
      const state: CreateMatchState = {
        ...custom,
        scale: "v",
        saveScale: true,
        scaleName: "Board",
      };
      expect(buildCreateMatchPayload(state).saveScaleName).toBeNull();
    });
  });
});

// ── Discipline (migration 091/092) ───────────────────────────────

describe("set-discipline", () => {
  it("re-points the scale when it doesn't belong to the new discipline", () => {
    // You cannot grade a rope in V. Leaving the scale alone here is
    // how a Match ends up mis-scaled.
    const boulder = { ...initialCreateMatchState(), scale: "v" as const };
    const sport = createMatchReducer(boulder, {
      type: "set-discipline",
      discipline: "sport",
    });
    expect(sport.discipline).toBe("sport");
    expect(sport.scale).toBe("french");
  });

  it("keeps a scale that suits the new discipline", () => {
    const sport = createMatchReducer(
      { ...initialCreateMatchState(), discipline: "sport", scale: "yds" },
      { type: "set-discipline", discipline: "top-rope" },
    );
    // Both rope disciplines offer YDS — no reason to move them.
    expect(sport.scale).toBe("yds");
  });

  it("leaves points and custom alone — they suit any discipline", () => {
    for (const scale of ["points", "custom"] as const) {
      const next = createMatchReducer(
        { ...initialCreateMatchState(), scale },
        { type: "set-discipline", discipline: "sport" },
      );
      expect(next.scale).toBe(scale);
    }
  });

  it("doesn't lose a half-built custom ladder when discipline changes", () => {
    // The reason `custom` is preserved above: someone typing out a
    // ladder shouldn't have it wiped by a discipline tap.
    const state = {
      ...initialCreateMatchState(),
      scale: "custom" as const,
      customGrades: ["slab", "the roof"],
    };
    const next = createMatchReducer(state, {
      type: "set-discipline",
      discipline: "top-rope",
    });
    expect(next.customGrades).toEqual(["slab", "the roof"]);
  });

  it("is a no-op when the discipline hasn't changed", () => {
    const state = initialCreateMatchState();
    expect(createMatchReducer(state, {
      type: "set-discipline",
      discipline: "boulder",
    })).toBe(state);
  });

  it("remembers each scale's range across discipline switches", () => {
    // The whole reason ranges is a map: flipping away and back must
    // not forget what you picked.
    let state = createMatchReducer(initialCreateMatchState(), {
      type: "set-range", scale: "v", min: 3, max: 9,
    });
    state = createMatchReducer(state, { type: "set-discipline", discipline: "sport" });
    state = createMatchReducer(state, { type: "set-range", scale: "french", min: 2, max: 12 });
    state = createMatchReducer(state, { type: "set-discipline", discipline: "boulder" });

    expect(state.scale).toBe("v");
    expect(state.ranges.v).toEqual([3, 9]);
    expect(state.ranges.french).toEqual([2, 12]);
    expect(buildCreateMatchPayload(state).minGrade).toBe(3);
  });

  it("sends the rope range and discipline on a sport match", () => {
    let state = createMatchReducer(initialCreateMatchState(), {
      type: "set-discipline", discipline: "sport",
    });
    state = createMatchReducer(state, {
      type: "set-range", scale: "french", min: 4, max: 14,
    });
    const payload = buildCreateMatchPayload(state);
    expect(payload.discipline).toBe("sport");
    expect(payload.gradingScale).toBe("french");
    expect(payload.minGrade).toBe(4);
    expect(payload.maxGrade).toBe(14);
    expect(payload.customGrades).toBeNull();
  });
});

// ── Handicap (migrations 098–100) ────────────────────────────────

describe("set-handicap", () => {
  it("turns off when the scale stops having grades", () => {
    // A handicap measures a send against a grade. `points` has none
    // and a custom ladder's ordinals aren't a difficulty scale, so
    // leaving the flag on would be a toggle that silently does
    // nothing — which reads as a bug the first time someone checks
    // the board.
    let state = createMatchReducer(initialCreateMatchState(), {
      type: "set-handicap",
      value: true,
    });
    expect(state.handicap).toBe(true);

    state = createMatchReducer(state, { type: "set-scale", scale: "points" });
    expect(state.handicap).toBe(false);
  });

  it("refuses to turn on for a scale with no grades", () => {
    const points = createMatchReducer(initialCreateMatchState(), {
      type: "set-scale",
      scale: "custom",
    });
    const attempted = createMatchReducer(points, {
      type: "set-handicap",
      value: true,
    });
    expect(attempted.handicap).toBe(false);
  });

  it("survives a discipline change, since both rope scales are graded", () => {
    let state = createMatchReducer(initialCreateMatchState(), {
      type: "set-handicap",
      value: true,
    });
    state = createMatchReducer(state, {
      type: "set-discipline",
      discipline: "sport",
    });
    expect(state.scale).toBe("french");
    expect(state.handicap).toBe(true);
  });

  it("sends the flag in the payload", () => {
    const state = createMatchReducer(initialCreateMatchState(), {
      type: "set-handicap",
      value: true,
    });
    expect(buildCreateMatchPayload(state).handicap).toBe(true);
  });
});
