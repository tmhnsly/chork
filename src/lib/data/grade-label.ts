/**
 * Grade-label helpers — single source of truth for mapping the stored
 * numeric `grade_vote` (0..30) to a user-facing label according to a
 * set's `grading_scale`.
 *
 * Used by:
 *   — GradeSlider (climber-side rating UI)
 *   — RouteLogSheet header community-grade display
 *   — SendGridTile / ClimberSheet (tile-level grade badges)
 *   — Admin dashboard grade-distribution widgets (future)
 */

/**
 * Discipline — boulder, sport or top-rope. See CONTEXT.md.
 *
 * It decides which grade scales are offered and what partial credit
 * is called. It deliberately does NOT touch scoring: `computePoints`
 * never reads grade, so a V4 and a 6a+ share one points total with no
 * equivalence to invent.
 */
export type Discipline = "boulder" | "sport" | "top-rope";

export const DISCIPLINES: readonly Discipline[] = [
  "boulder",
  "sport",
  "top-rope",
] as const;

export function isDiscipline(value: unknown): value is Discipline {
  return (
    value === "boulder" || value === "sport" || value === "top-rope"
  );
}

/** How a discipline names itself in the UI. */
export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  boulder: "Boulder",
  sport: "Sport",
  "top-rope": "Top rope",
};

/**
 * What partial credit is called.
 *
 * The column is `zone` on every route regardless — this is a display
 * name, not a second concept. A boulder has a zone hold; a rope route
 * has a highpoint.
 */
export function partialCreditLabel(discipline: Discipline): string {
  return discipline === "boulder" ? "Zone" : "Highpoint";
}

export type GradingScale =
  | "v"
  | "font"
  | "points"
  | "yds"
  | "french";

/**
 * Every scale the app knows about, including the match-only `custom`
 * scale (migration 046). Formula scales (`v` / `font`) map a numeric
 * grade through a fixed sequence; `custom` resolves by ordinal lookup
 * into a per-match grade ladder; `points` disables grading entirely.
 */
export type GradingScaleWithCustom = GradingScale | "custom";

/** One rung of a match's custom grade ladder (`match_grades` row shape). */
export interface CustomGradeEntry {
  ordinal: number;
  label: string;
}

/**
 * Font bouldering grade sequence, indexed 0-based. Matches the Fontainebleau
 * system bouldering grades from 3 up to 8C+.
 */
const FONT_GRADES = [
  "3", "4", "5", "5+",
  "6A", "6A+", "6B", "6B+", "6C", "6C+",
  "7A", "7A+", "7B", "7B+", "7C", "7C+",
  "8A", "8A+", "8B", "8B+", "8C", "8C+",
];

/**
 * Yosemite Decimal System, the rope scale used in the US. Sub-5.10
 * has no letter grades, which is why this is a list rather than a
 * formula.
 */
const YDS_GRADES = [
  "5.5", "5.6", "5.7", "5.8", "5.9",
  "5.10a", "5.10b", "5.10c", "5.10d",
  "5.11a", "5.11b", "5.11c", "5.11d",
  "5.12a", "5.12b", "5.12c", "5.12d",
  "5.13a", "5.13b", "5.13c", "5.13d",
  "5.14a", "5.14b", "5.14c", "5.14d",
  "5.15a", "5.15b", "5.15c", "5.15d",
];

/**
 * French sport grades.
 *
 * Lowercase on purpose. This is a DIFFERENT system from `font` above
 * despite `6a` and `6A` looking almost alike — Font grades boulders,
 * French grades routes, and the two are nowhere near equivalent at
 * the same number. The case is the convention that tells them apart,
 * so never normalise it.
 */
const FRENCH_GRADES = [
  "4", "5a", "5b", "5c",
  "6a", "6a+", "6b", "6b+", "6c", "6c+",
  "7a", "7a+", "7b", "7b+", "7c", "7c+",
  "8a", "8a+", "8b", "8b+", "8c", "8c+",
  "9a", "9a+", "9b", "9b+", "9c",
];

/** Highest numeric index supported by each scale. */
export const SCALE_HARD_MAX: Record<GradingScale, number> = {
  v: 17,                          // V0..V17
  font: FONT_GRADES.length - 1,   // 0..21
  yds: YDS_GRADES.length - 1,     // 0..28
  french: FRENCH_GRADES.length - 1, // 0..26
  points: 0,
};

/** Sensible default upper bound when an admin first picks a scale. */
export const SCALE_DEFAULT_MAX: Record<GradingScale, number> = {
  v: 10,
  font: 15,   // 7C+
  yds: 16,    // 5.12d
  french: 15, // 7c+
  points: 0,
};

/**
 * Which scales a discipline offers.
 *
 * `points` and `custom` suit any discipline, so they are appended by
 * the caller rather than repeated here. Deliberately not enforced by
 * a DB constraint — a Set's discipline is only a default and its
 * routes may each differ, so a mixed Match on a custom ladder is a
 * legitimate shape. See migration 091.
 */
export const DISCIPLINE_SCALES: Record<Discipline, readonly GradingScale[]> = {
  boulder: ["v", "font"],
  sport: ["french", "yds"],
  "top-rope": ["french", "yds"],
};

/**
 * Which grading family a discipline belongs to.
 *
 * Sport and top-rope grade identically — French / YDS — and
 * bouldering does not. So a session that mixes disciplines needs at
 * most TWO scales, never three, which is the whole reason a Match
 * carries one alternate rather than one per discipline.
 *
 * Mirrored in SQL as `discipline_family` (migration 117), the same
 * way `computePoints` is mirrored by `compute_points`.
 */
export type DisciplineFamily = "boulder" | "rope";

export function disciplineFamily(discipline: Discipline): DisciplineFamily {
  return discipline === "boulder" ? "boulder" : "rope";
}

/** The family a scale grades for. `custom` and `points` have none. */
export function scaleFamily(
  scale: GradingScaleWithCustom,
): DisciplineFamily | null {
  if (scale === "v" || scale === "font") return "boulder";
  if (scale === "french" || scale === "yds") return "rope";
  return null;
}

/**
 * The scale + range a route is graded on, given the Match it lives in.
 *
 * A Match's own scale covers its own discipline family; `alt_*` covers
 * the other one, and is null for a single-discipline session. A route
 * whose family has no scale returns null and stays ungraded — which
 * before migration 117 was every rope route on a bouldering Match, and
 * is now only a route someone switched to a family they said they
 * weren't climbing.
 */
export interface MatchScales {
  discipline: Discipline;
  grading_scale: GradingScaleWithCustom;
  min_grade: number | null;
  max_grade: number | null;
  alt_grading_scale: GradingScaleWithCustom | null;
  alt_min_grade: number | null;
  alt_max_grade: number | null;
}

export interface ResolvedScale {
  scale: GradingScaleWithCustom;
  min: number | null;
  max: number | null;
}

/**
 * Label a ROUTE's grade in the scale that route is actually graded on.
 *
 * Never label a Match route with `makeGradeLabeller(match.grading_scale)`
 * directly: on a mixed day a 6b top-rope route and a V6 boulder share
 * the ordinal 6, and the Match's own scale would render both as "V6".
 * This resolves each route's family first.
 *
 * Returns null for an ungraded route and for one whose family has no
 * scale, which reads the same to a climber — no grade to show.
 */
export function makeRouteLabeller(
  match: MatchScales,
  grades: CustomGradeEntry[],
): (route: { declared_grade: number | null; discipline: Discipline | null }) => string | null {
  return (route) => {
    if (route.declared_grade === null) return null;
    const resolved = scaleForDiscipline(
      match,
      route.discipline ?? match.discipline,
    );
    if (resolved === null) return null;
    return makeGradeLabeller(resolved.scale, grades)(route.declared_grade);
  };
}

export function scaleForDiscipline(
  match: MatchScales,
  discipline: Discipline,
): ResolvedScale | null {
  // A custom ladder or a points-only Match has one scale by
  // definition, and it applies whatever you climb — the ordinals
  // aren't tied to a discipline in the first place.
  if (match.grading_scale === "custom" || match.grading_scale === "points") {
    return {
      scale: match.grading_scale,
      min: match.min_grade,
      max: match.max_grade,
    };
  }
  if (disciplineFamily(discipline) === disciplineFamily(match.discipline)) {
    return {
      scale: match.grading_scale,
      min: match.min_grade,
      max: match.max_grade,
    };
  }
  if (match.alt_grading_scale === null) return null;
  return {
    scale: match.alt_grading_scale,
    min: match.alt_min_grade,
    max: match.alt_max_grade,
  };
}

/**
 * How a scale names itself in a picker or a summary row.
 *
 * Covers `custom` as well, so the Match create form, the join
 * preview and any gym-side picker all read one map — they used to
 * keep a second copy that had to be updated in lock-step whenever
 * the enum grew.
 */
export const SCALE_LABEL: Record<GradingScaleWithCustom, string> = {
  v: "V-scale",
  font: "Font",
  yds: "YDS",
  french: "French",
  points: "Points only",
  custom: "Custom",
};

/**
 * Convert a stored numeric grade into a display label.
 * Returns null for `points` scale (grade display is disabled).
 */
export function formatGrade(
  value: number,
  scale: GradingScale = "v"
): string | null {
  if (scale === "points") return null;
  if (scale === "v") return `V${clamp(value, 0, SCALE_HARD_MAX.v)}`;
  const sequence =
    scale === "font" ? FONT_GRADES
    : scale === "yds" ? YDS_GRADES
    : scale === "french" ? FRENCH_GRADES
    : null;
  if (sequence) {
    const idx = clamp(value, 0, sequence.length - 1);
    return sequence[idx] ?? String(idx);
  }
  return String(value);
}

/**
 * All selectable grade labels for a given scale, bounded to the set's max.
 * Used by the slider + admin distribution widgets.
 */
export function gradeLabels(
  scale: GradingScale,
  max: number
): string[] {
  if (scale === "points") return [];
  const hardMax = SCALE_HARD_MAX[scale];
  const cap = clamp(max, 0, hardMax);
  const labels: string[] = [];
  for (let i = 0; i <= cap; i++) {
    const label = formatGrade(i, scale);
    if (label) labels.push(label);
  }
  return labels;
}

/**
 * Build a `(grade) => label` resolver that hides the formula-vs-ordinal
 * split so call sites never branch on `scale === "custom"` themselves.
 *
 *   — `v` / `font` delegate to `formatGrade` (clamped to the hard max)
 *   — `custom` looks the grade up by ordinal in `customGrades`;
 *     a miss returns null
 *   — `points` always returns null (grade display is disabled)
 *   — a null / undefined grade returns null on every scale
 */
export function makeGradeLabeller(
  scale: GradingScaleWithCustom,
  customGrades: readonly CustomGradeEntry[] = [],
): (grade: number | null | undefined) => string | null {
  if (scale === "custom") {
    const byOrdinal = new Map(customGrades.map((g) => [g.ordinal, g.label]));
    return (grade) =>
      grade === null || grade === undefined
        ? null
        : (byOrdinal.get(grade) ?? null);
  }
  return (grade) =>
    grade === null || grade === undefined ? null : formatGrade(grade, scale);
}

/** One selectable entry in a grade picker. */
export interface GradeOption {
  value: number;
  label: string;
}

/**
 * All selectable `{ value, label }` grade options for a scale,
 * regardless of whether it's formula-based or custom.
 *
 *   — `v` / `font`: sequential indices bounded to `[min, max]`
 *     (clamped to the scale's hard max; defaults to the full range)
 *   — `custom`: one option per ladder entry, valued by ordinal
 *     (min / max don't apply — the ladder IS the range)
 *   — `points`: empty (grading disabled)
 */
export function gradeOptions(
  scale: GradingScaleWithCustom,
  opts: {
    customGrades?: readonly CustomGradeEntry[];
    min?: number | null;
    max?: number | null;
  } = {},
): GradeOption[] {
  if (scale === "points") return [];
  if (scale === "custom") {
    return (opts.customGrades ?? []).map((g) => ({
      value: g.ordinal,
      label: g.label,
    }));
  }
  const hardMax = SCALE_HARD_MAX[scale];
  const lo = Math.max(opts.min ?? 0, 0);
  const hi = Math.min(opts.max ?? hardMax, hardMax);
  const options: GradeOption[] = [];
  for (let i = lo; i <= hi; i++) {
    const label = formatGrade(i, scale);
    if (label) options.push({ value: i, label });
  }
  return options;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
