import {
  formatGrade,
  DISCIPLINE_LABEL,
  SCALE_LABEL,
  type Discipline,
  type GradingScale,
} from "./grade-label";

/**
 * Shaping for the grade pyramid on a climber's profile.
 *
 * Pure — the RPC (`get_grade_distribution`, migration 094) returns a
 * flat rollup and this turns it into the pyramids the UI draws. Kept
 * out of the component so the rules that actually matter (which
 * grades get a rung, what counts as excluded, how flashes sit inside
 * a bar) are unit-testable without a render.
 */

/** One row exactly as the RPC returns it. */
export interface GradeDistributionRow {
  discipline: string;
  /** Null for the excluded bucket — see `ungradedSends`. */
  grading_scale: string | null;
  /** Null for the excluded bucket. */
  grade: number | null;
  sends: number;
  flashes: number;
}

/** One rung of a pyramid. */
export interface PyramidRung {
  grade: number;
  label: string;
  sends: number;
  flashes: number;
}

export interface GradePyramid {
  discipline: Discipline;
  scale: GradingScale;
  /** How this pyramid names itself, e.g. "Boulder · V-scale". */
  title: string;
  /** Hardest first, so it reads top-down like a pyramid. */
  rungs: PyramidRung[];
  /** Widest bar, for scaling every other bar against. */
  maxSends: number;
  totalSends: number;
  totalFlashes: number;
}

export interface GradeDistribution {
  pyramids: GradePyramid[];
  /**
   * Sends that couldn't sit on any pyramid: a points-only Set has no
   * grades, and a custom ladder's ordinals mean something different
   * in every Match. Surfaced rather than dropped so the UI can say
   * what it left out — climbers notice when a total doesn't match.
   */
  ungradedSends: number;
}

export function isNumericScale(scale: string): scale is GradingScale {
  return (
    scale === "v" || scale === "font" || scale === "yds" || scale === "french"
  );
}

export function isKnownDiscipline(value: string): value is Discipline {
  return value === "boulder" || value === "sport" || value === "top-rope";
}

/**
 * Turn the flat rollup into one pyramid per (discipline, scale).
 *
 * Gaps are filled: a climber with sends at V2 and V5 gets rungs for
 * V3 and V4 at zero. A pyramid with a hole in it says something —
 * a sparse list of only the grades you've touched doesn't.
 */
export function buildGradeDistribution(
  rows: readonly GradeDistributionRow[],
): GradeDistribution {
  let ungradedSends = 0;
  const groups = new Map<string, { discipline: Discipline; scale: GradingScale; byGrade: Map<number, PyramidRung> }>();

  for (const row of rows) {
    if (
      row.grading_scale === null
      || row.grade === null
      || !isNumericScale(row.grading_scale)
      || !isKnownDiscipline(row.discipline)
    ) {
      ungradedSends += row.sends;
      continue;
    }

    const key = `${row.discipline}:${row.grading_scale}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        discipline: row.discipline,
        scale: row.grading_scale,
        byGrade: new Map(),
      };
      groups.set(key, group);
    }

    // The RPC groups already, but summing defensively costs nothing
    // and means a future caller can pass unaggregated rows.
    const existing = group.byGrade.get(row.grade);
    if (existing) {
      existing.sends += row.sends;
      existing.flashes += row.flashes;
    } else {
      group.byGrade.set(row.grade, {
        grade: row.grade,
        label: formatGrade(row.grade, row.grading_scale) ?? String(row.grade),
        sends: row.sends,
        flashes: row.flashes,
      });
    }
  }

  const pyramids: GradePyramid[] = [];
  for (const group of groups.values()) {
    const grades = [...group.byGrade.keys()];
    const lo = Math.min(...grades);
    const hi = Math.max(...grades);

    const rungs: PyramidRung[] = [];
    for (let g = hi; g >= lo; g--) {
      rungs.push(
        group.byGrade.get(g) ?? {
          grade: g,
          label: formatGrade(g, group.scale) ?? String(g),
          sends: 0,
          flashes: 0,
        },
      );
    }

    pyramids.push({
      discipline: group.discipline,
      scale: group.scale,
      title: `${DISCIPLINE_LABEL[group.discipline]} · ${SCALE_LABEL[group.scale]}`,
      rungs,
      maxSends: Math.max(...rungs.map((r) => r.sends), 1),
      totalSends: rungs.reduce((sum, r) => sum + r.sends, 0),
      totalFlashes: rungs.reduce((sum, r) => sum + r.flashes, 0),
    });
  }

  // Busiest first — a climber with 40 boulder sends and 2 rope sends
  // wants the boulders at the top.
  pyramids.sort((a, b) => b.totalSends - a.totalSends);

  return { pyramids, ungradedSends };
}
