/**
 * Grade-label helpers — single source of truth for mapping the stored
 * numeric `grade_vote` (0..30) to a user-facing label according to a
 * set's `grading_scale`.
 *
 * Used by:
 *   — GradeSlider (climber-side rating UI)
 *   — RouteLogSheet header community-grade display
 *   — PunchTile / ClimberSheet (tile-level grade badges)
 *   — Admin dashboard grade-distribution widgets (future)
 */

export type GradingScale = "v" | "font" | "points";

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

/** Highest numeric index supported by each scale. */
export const SCALE_HARD_MAX: Record<GradingScale, number> = {
  v: 17,                       // V0..V17
  font: FONT_GRADES.length - 1, // 0..21
  points: 0,
};

/** Sensible default upper bound when an admin first picks a scale. */
export const SCALE_DEFAULT_MAX: Record<GradingScale, number> = {
  v: 10,
  font: 15, // 7C+
  points: 0,
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
  if (scale === "font") {
    const idx = clamp(value, 0, SCALE_HARD_MAX.font);
    return FONT_GRADES[idx] ?? String(idx);
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
