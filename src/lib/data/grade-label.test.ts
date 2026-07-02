import { describe, it, expect } from "vitest";
import {
  formatGrade,
  gradeLabels,
  gradeOptions,
  makeGradeLabeller,
  SCALE_DEFAULT_MAX,
  SCALE_HARD_MAX,
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
