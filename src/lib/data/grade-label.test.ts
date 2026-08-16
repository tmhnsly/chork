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
  disciplineFamily,
  scaleFamily,
  scaleForDiscipline,
  makeRouteLabeller,
  ceilingForDiscipline,
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

// ── A mixed day (migration 117) ─────────────────────────────────

describe("disciplineFamily", () => {
  it("puts sport and top-rope on the same ladder", () => {
    // The whole reason a Match needs two scales and never three.
    expect(disciplineFamily("sport")).toBe("rope");
    expect(disciplineFamily("top-rope")).toBe("rope");
    expect(disciplineFamily("boulder")).toBe("boulder");
  });

  it("agrees with DISCIPLINE_SCALES", () => {
    // The families exist because these two sets of scales are
    // disjoint. If that ever stops being true the split is wrong, so
    // derive the check from the table rather than restating it.
    for (const d of DISCIPLINES) {
      for (const scale of DISCIPLINE_SCALES[d]) {
        expect(scaleFamily(scale), `${d}/${scale}`).toBe(disciplineFamily(d));
      }
    }
  });
});

describe("scaleFamily", () => {
  it("has none for custom or points", () => {
    // A custom ladder is one ladder whatever you climb, and points has
    // no grades at all — neither belongs to a discipline.
    expect(scaleFamily("custom")).toBeNull();
    expect(scaleFamily("points")).toBeNull();
  });
});

describe("scaleForDiscipline", () => {
  const boulderMatch = {
    discipline: "boulder" as const,
    grading_scale: "v" as const,
    min_grade: 0,
    max_grade: 8,
    alt_grading_scale: null,
    alt_min_grade: null,
    alt_max_grade: null,
  };
  const mixed = {
    ...boulderMatch,
    alt_grading_scale: "french" as const,
    alt_min_grade: 2,
    alt_max_grade: 15,
  };

  it("uses the Match's own scale for its own family", () => {
    expect(scaleForDiscipline(mixed, "boulder")).toEqual({
      scale: "v",
      min: 0,
      max: 8,
    });
  });

  it("uses the alternate for the other family", () => {
    // The bug this exists for: before 117 a top-rope route on a
    // V-scale Match had no scale at all and was forced ungraded.
    expect(scaleForDiscipline(mixed, "top-rope")).toEqual({
      scale: "french",
      min: 2,
      max: 15,
    });
  });

  it("treats sport and top-rope identically", () => {
    expect(scaleForDiscipline(mixed, "sport")).toEqual(
      scaleForDiscipline(mixed, "top-rope"),
    );
  });

  it("has nothing for the other family on a single-discipline day", () => {
    // Still reachable: someone sets up boulders only, then switches a
    // route to a rope. It stays ungraded, and the sheet says why.
    expect(scaleForDiscipline(boulderMatch, "top-rope")).toBeNull();
    expect(scaleForDiscipline(boulderMatch, "boulder")).not.toBeNull();
  });

  it("works the same way round from a roped Match", () => {
    // The reason the column is `alt_` and not `rope_`: a Sport Match
    // adding boulders needs exactly the same second slot.
    const ropeFirst = {
      discipline: "sport" as const,
      grading_scale: "french" as const,
      min_grade: 2,
      max_grade: 15,
      alt_grading_scale: "v" as const,
      alt_min_grade: 0,
      alt_max_grade: 8,
    };
    expect(scaleForDiscipline(ropeFirst, "sport")?.scale).toBe("french");
    expect(scaleForDiscipline(ropeFirst, "boulder")?.scale).toBe("v");
  });

  it("applies one ladder to everything on custom or points", () => {
    // A custom ladder's ordinals aren't tied to a discipline, so it
    // covers whatever you climb rather than half of it.
    for (const scale of ["custom", "points"] as const) {
      const m = { ...boulderMatch, grading_scale: scale };
      expect(scaleForDiscipline(m, "top-rope")?.scale, scale).toBe(scale);
      expect(scaleForDiscipline(m, "boulder")?.scale, scale).toBe(scale);
    }
  });
});

describe("makeRouteLabeller", () => {
  const mixed = {
    discipline: "boulder" as const,
    grading_scale: "v" as const,
    min_grade: 0,
    max_grade: 8,
    alt_grading_scale: "french" as const,
    alt_min_grade: 0,
    alt_max_grade: 20,
  };

  /**
   * The one that decides why this function exists. A French 6b and a
   * V6 are BOTH ordinal 6 — labelling every route with the Match's own
   * scale renders the rope as "V6", which is a grade the climber never
   * gave and a discipline they didn't climb.
   */
  it("labels the same ordinal differently per family", () => {
    const label = makeRouteLabeller(mixed, []);
    expect(label({ declared_grade: 6, discipline: "boulder" })).toBe("V6");
    expect(label({ declared_grade: 6, discipline: "top-rope" })).not.toBe("V6");
  });

  it("falls back to the Match's discipline when the route inherits", () => {
    // Null discipline means "inherit", not "unknown".
    const label = makeRouteLabeller(mixed, []);
    expect(label({ declared_grade: 6, discipline: null })).toBe("V6");
  });

  it("says nothing for an ungraded route", () => {
    const label = makeRouteLabeller(mixed, []);
    expect(label({ declared_grade: null, discipline: "boulder" })).toBeNull();
  });

  it("says nothing when the family has no scale", () => {
    // Reads the same to a climber as ungraded, which is what it is.
    const single = { ...mixed, alt_grading_scale: null };
    const label = makeRouteLabeller(single, []);
    expect(label({ declared_grade: 6, discipline: "top-rope" })).toBeNull();
  });
});

describe("ceilingForDiscipline", () => {
  const mixed = {
    discipline: "boulder" as const,
    grading_scale: "v" as const,
    min_grade: 0,
    max_grade: 8,
    alt_grading_scale: "french" as const,
    alt_min_grade: 0,
    alt_max_grade: 20,
  };
  // V4 on the boulders, French ordinal 12 on the ropes — one climber,
  // two limits, no arithmetic in common.
  const player = { ceiling: 4, alt_ceiling: 12 };

  it("measures a route against its own family's limit", () => {
    expect(ceilingForDiscipline(mixed, player, "boulder")).toBe(4);
    expect(ceilingForDiscipline(mixed, player, "top-rope")).toBe(12);
    expect(ceilingForDiscipline(mixed, player, "sport")).toBe(12);
  });

  it("treats a route that inherits as the Match's own discipline", () => {
    // Null means "inherit", not "unknown".
    expect(ceilingForDiscipline(mixed, player, null)).toBe(4);
  });

  it("works the same way round from a roped Match", () => {
    const ropeFirst = { ...mixed, discipline: "sport" as const };
    expect(ceilingForDiscipline(ropeFirst, player, "sport")).toBe(4);
    expect(ceilingForDiscipline(ropeFirst, player, "boulder")).toBe(12);
  });

  /**
   * The case migration 121 exists for. Before it there was one
   * ceiling, so an off-family route was scored as "limit unknown" and
   * went through unhandicapped — the rope half of a mixed session was
   * the half the handicap didn't apply to.
   */
  it("returns null only when that family's limit was never given", () => {
    const boulderOnly = { ceiling: 4, alt_ceiling: null };
    expect(ceilingForDiscipline(mixed, boulderOnly, "boulder")).toBe(4);
    expect(ceilingForDiscipline(mixed, boulderOnly, "top-rope")).toBeNull();
  });
});
