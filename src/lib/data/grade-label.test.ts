import { describe, it, expect } from "vitest";
import {
  formatGrade,
  gradeLabels,
  gradeOptions,
  makeGradeLabeller,
  SCALE_DEFAULT_MAX,
  SCALE_HARD_MAX,
  SCALE_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
  DISCIPLINE_SCALES,
  isDiscipline,
  partialCreditLabel,
} from "./grade-label";

describe("formatGrade", () => {
  it("formats V-scale values as V{n}", () => {
    expect(formatGrade(0, "v")).toBe("V0");
    expect(formatGrade(10, "v")).toBe("V10");
    expect(formatGrade(17, "v")).toBe("V17");
  });

  it("clamps V-scale values above the hard max", () => {
    expect(formatGrade(99, "v")).toBe("V17");
  });

  it("clamps V-scale values below zero", () => {
    expect(formatGrade(-3, "v")).toBe("V0");
  });

  it("formats Font values using the Fontainebleau grade sequence", () => {
    expect(formatGrade(0, "font")).toBe("3");
    expect(formatGrade(10, "font")).toBe("7A");
    expect(formatGrade(14, "font")).toBe("7C");
  });

  it("returns null for points-only sets (grading disabled)", () => {
    expect(formatGrade(5, "points")).toBeNull();
  });

  it("defaults to V-scale when no scale is passed", () => {
    expect(formatGrade(4)).toBe("V4");
  });
});

describe("gradeLabels", () => {
  it("emits V0..Vmax for V scale bounded by the set's max", () => {
    expect(gradeLabels("v", 4)).toEqual(["V0", "V1", "V2", "V3", "V4"]);
  });

  it("emits Font labels in sequence, bounded by max", () => {
    expect(gradeLabels("font", 3)).toEqual(["3", "4", "5", "5+"]);
  });

  it("clamps to the scale's hard max so admins can't configure an out-of-range slider", () => {
    const labels = gradeLabels("v", 50);
    expect(labels).toHaveLength(SCALE_HARD_MAX.v + 1);
    expect(labels.at(-1)).toBe(`V${SCALE_HARD_MAX.v}`);
  });

  it("returns an empty list on the points scale — climber-side grading is off", () => {
    expect(gradeLabels("points", SCALE_DEFAULT_MAX.points)).toEqual([]);
  });
});

describe("makeGradeLabeller", () => {
  const ladder = [
    { ordinal: 0, label: "Green" },
    { ordinal: 1, label: "Blue" },
    { ordinal: 2, label: "Black" },
  ];

  it("resolves custom grades by ordinal lookup", () => {
    const labelFor = makeGradeLabeller("custom", ladder);
    expect(labelFor(0)).toBe("Green");
    expect(labelFor(2)).toBe("Black");
  });

  it("returns null on a custom ordinal miss — never clamps or guesses", () => {
    const labelFor = makeGradeLabeller("custom", ladder);
    expect(labelFor(3)).toBeNull();
    expect(labelFor(-1)).toBeNull();
  });

  it("returns null on the custom scale when no ladder is provided", () => {
    expect(makeGradeLabeller("custom")(0)).toBeNull();
  });

  it("returns null for null/undefined grades on every scale", () => {
    expect(makeGradeLabeller("custom", ladder)(null)).toBeNull();
    expect(makeGradeLabeller("custom", ladder)(undefined)).toBeNull();
    expect(makeGradeLabeller("v")(null)).toBeNull();
    expect(makeGradeLabeller("points")(null)).toBeNull();
  });

  it("delegates formula scales to formatGrade, clamping included", () => {
    expect(makeGradeLabeller("v")(4)).toBe(formatGrade(4, "v"));
    expect(makeGradeLabeller("v")(99)).toBe(`V${SCALE_HARD_MAX.v}`);
    expect(makeGradeLabeller("font")(10)).toBe(formatGrade(10, "font"));
  });

  it("always returns null on the points scale — grading disabled", () => {
    expect(makeGradeLabeller("points")(5)).toBeNull();
  });
});

describe("gradeOptions", () => {
  const ladder = [
    { ordinal: 0, label: "Green" },
    { ordinal: 1, label: "Blue" },
    { ordinal: 2, label: "Black" },
  ];

  it("maps a custom ladder to { value: ordinal, label } options", () => {
    expect(gradeOptions("custom", { customGrades: ladder })).toEqual([
      { value: 0, label: "Green" },
      { value: 1, label: "Blue" },
      { value: 2, label: "Black" },
    ]);
  });

  it("ignores min/max on the custom scale — the ladder IS the range", () => {
    expect(
      gradeOptions("custom", { customGrades: ladder, min: 1, max: 1 }),
    ).toHaveLength(3);
  });

  it("emits sequential formula options bounded by min/max", () => {
    expect(gradeOptions("v", { min: 2, max: 4 })).toEqual([
      { value: 2, label: "V2" },
      { value: 3, label: "V3" },
      { value: 4, label: "V4" },
    ]);
  });

  it("defaults to the full scale range when bounds are null", () => {
    const options = gradeOptions("v", { min: null, max: null });
    expect(options).toHaveLength(SCALE_HARD_MAX.v + 1);
    expect(options[0]).toEqual({ value: 0, label: "V0" });
    expect(options.at(-1)).toEqual({
      value: SCALE_HARD_MAX.v,
      label: `V${SCALE_HARD_MAX.v}`,
    });
  });

  it("clamps a max_grade beyond the scale's hard max", () => {
    const options = gradeOptions("font", { max: 99 });
    expect(options.at(-1)?.label).toBe("8C+");
    expect(options).toHaveLength(SCALE_HARD_MAX.font + 1);
  });

  it("returns an empty list on the points scale", () => {
    expect(gradeOptions("points")).toEqual([]);
    expect(gradeOptions("points", { customGrades: ladder })).toEqual([]);
  });
});

// ── Rope scales + discipline (migration 091) ─────────────────────

describe("rope grading scales", () => {
  it("formats YDS, including the letterless sub-5.10 rungs", () => {
    // 5.5–5.9 have no letter grades; 5.10 upwards do. That asymmetry
    // is why YDS is a list and not a formula.
    expect(formatGrade(0, "yds")).toBe("5.5");
    expect(formatGrade(4, "yds")).toBe("5.9");
    expect(formatGrade(5, "yds")).toBe("5.10a");
    expect(formatGrade(SCALE_HARD_MAX.yds, "yds")).toBe("5.15d");
  });

  it("formats French sport grades in lower case", () => {
    expect(formatGrade(4, "french")).toBe("6a");
    expect(formatGrade(SCALE_HARD_MAX.french, "french")).toBe("9c");
  });

  /**
   * The one that would bite hardest in the wild: `font` grades
   * boulders and `french` grades routes, and at the same index they
   * are nowhere near each other. Case is the only thing distinguishing
   * `6A` from `6a` on a screen, so a "helpful" normalisation anywhere
   * in the pipeline would silently misgrade every rope climb.
   */
  it("keeps Font and French distinct — they are not the same system", () => {
    expect(formatGrade(4, "font")).toBe("6A");
    expect(formatGrade(4, "french")).toBe("6a");
    expect(formatGrade(4, "font")).not.toBe(formatGrade(4, "french"));

    const fontLabels = gradeLabels("font", SCALE_HARD_MAX.font);
    const frenchLabels = gradeLabels("french", SCALE_HARD_MAX.french);
    expect(fontLabels.some((l) => l !== l.toUpperCase())).toBe(false);
    expect(frenchLabels.some((l) => l !== l.toLowerCase())).toBe(false);
  });

  it("clamps out-of-range values to the scale's ends", () => {
    expect(formatGrade(-5, "yds")).toBe("5.5");
    expect(formatGrade(999, "french")).toBe("9c");
  });

  it("gives every scale a hard max, default max and label", () => {
    // A scale missing from any of these three maps is a runtime
    // `undefined` in a picker rather than a compile error, because
    // they're keyed by the union.
    for (const scale of ["v", "font", "yds", "french", "points"] as const) {
      expect(SCALE_HARD_MAX[scale]).toBeTypeOf("number");
      expect(SCALE_DEFAULT_MAX[scale]).toBeTypeOf("number");
      expect(SCALE_LABEL[scale]).toBeTruthy();
    }
    expect(SCALE_LABEL.custom).toBeTruthy();
  });

  it("keeps every default max inside its scale's hard max", () => {
    for (const scale of ["v", "font", "yds", "french", "points"] as const) {
      expect(SCALE_DEFAULT_MAX[scale]).toBeLessThanOrEqual(SCALE_HARD_MAX[scale]);
    }
  });

  it("keeps every scale inside the DB's 0..30 grade bound", () => {
    // `sets.min_grade` / `max_grade` and `routes.declared_grade` are
    // all CHECKed to 0..30, so a scale longer than that would produce
    // grades the database refuses to store.
    for (const scale of ["v", "font", "yds", "french"] as const) {
      expect(SCALE_HARD_MAX[scale]).toBeLessThanOrEqual(30);
    }
  });
});

describe("discipline", () => {
  it("offers boulder scales to boulderers and rope scales to ropes", () => {
    expect(DISCIPLINE_SCALES.boulder).toEqual(["v", "font"]);
    expect(DISCIPLINE_SCALES.sport).toEqual(["french", "yds"]);
    expect(DISCIPLINE_SCALES["top-rope"]).toEqual(["french", "yds"]);
  });

  it("never offers a boulder scale for a rope, or the reverse", () => {
    const boulderOnly = new Set(["v", "font"]);
    for (const d of ["sport", "top-rope"] as const) {
      for (const scale of DISCIPLINE_SCALES[d]) {
        expect(boulderOnly.has(scale)).toBe(false);
      }
    }
    for (const scale of DISCIPLINE_SCALES.boulder) {
      expect(["yds", "french"]).not.toContain(scale);
    }
  });

  it("names partial credit after the discipline", () => {
    // Same `zone` column throughout — this is a display name, not a
    // second concept.
    expect(partialCreditLabel("boulder")).toBe("Zone");
    expect(partialCreditLabel("sport")).toBe("Highpoint");
    expect(partialCreditLabel("top-rope")).toBe("Highpoint");
  });

  it("covers every discipline in DISCIPLINES, labels and scales", () => {
    for (const d of DISCIPLINES) {
      expect(isDiscipline(d)).toBe(true);
      expect(DISCIPLINE_LABEL[d]).toBeTruthy();
      expect(DISCIPLINE_SCALES[d].length).toBeGreaterThan(0);
    }
    expect(DISCIPLINES).toHaveLength(3);
  });

  it("rejects anything that isn't a discipline", () => {
    for (const bad of ["Boulder", "trad", "", null, undefined, 1]) {
      expect(isDiscipline(bad)).toBe(false);
    }
  });
});
