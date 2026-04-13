import { describe, it, expect } from "vitest";
import { formatGrade, gradeLabels, SCALE_DEFAULT_MAX, SCALE_HARD_MAX } from "./grade-label";

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
