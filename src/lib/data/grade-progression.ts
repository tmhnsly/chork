import {
  DISCIPLINE_LABEL,
  SCALE_LABEL,
  formatGrade,
  type Discipline,
  type GradingScale,
} from "./grade-label";
import { isNumericScale, isKnownDiscipline } from "./grade-distribution";

/**
 * Shaping for the grade-progression chart on a climber's profile.
 *
 * Pure — the RPC (`get_grade_progression`, migration 135) returns one
 * row per (month, discipline, scale) with that month's best sent
 * grade, and this turns it into drawable series. Kept out of the
 * component so the rules that matter (gap months, the twelve-month
 * window, never merging scales) are unit-testable without a render.
 *
 * Dates are handled as (year, month) ordinals, never `Date` — a
 * calendar month is arithmetic, and a timezone has no business moving
 * a send between months at render time.
 */

/** One row exactly as the RPC returns it. */
export interface GradeProgressionRow {
  /** First day of the month, `yyyy-mm-dd`. */
  month: string;
  discipline: string;
  grading_scale: string | null;
  best_grade: number | null;
  best_was_flash: boolean;
}

/** One month's column. */
export interface ProgressionBucket {
  /** `yyyy-mm` — stable key for the column. */
  key: string;
  /** Short month name — "Jun". */
  label: string;
  /** Best grade sent that month; null = no graded send. */
  grade: number | null;
  /** The grade as the scale writes it — "V6", "6a+". */
  gradeLabel: string | null;
  /** True when a send at that month's best grade was a flash. */
  flashed: boolean;
}

export interface GradeProgression {
  discipline: Discipline;
  scale: GradingScale;
  /** How this series names itself, e.g. "Boulder · V-scale". */
  title: string;
  /** Oldest first; gap months present with `grade: null`. */
  buckets: ProgressionBucket[];
  /** Lowest best-grade in the window — the bar scale's floor. */
  minGrade: number;
  /** Highest best-grade in the window — the bar scale's ceiling. */
  maxGrade: number;
}

/** The chart shows at most a year — beyond that it's archaeology. */
const WINDOW_MONTHS = 12;

const MONTH_LABEL = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-06-01" → months-since-year-zero ordinal. */
function toOrdinal(month: string): number {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  return year * 12 + m;
}

function ordinalKey(ordinal: number): string {
  const year = Math.floor(ordinal / 12);
  const m = ordinal % 12;
  return `${year}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Turn the monthly rollup into one series per (discipline, scale).
 *
 * Gap months between the first and last send are filled with empty
 * buckets — a flat spot in a progression says something; a chart that
 * silently skips April doesn't. Nothing is padded BEFORE the first
 * graded send, and history beyond twelve months is trimmed from the
 * old end.
 */
export function buildGradeProgression(
  rows: readonly GradeProgressionRow[],
): GradeProgression[] {
  const groups = new Map<
    string,
    {
      discipline: Discipline;
      scale: GradingScale;
      byOrdinal: Map<number, { grade: number; flashed: boolean }>;
    }
  >();

  for (const row of rows) {
    if (
      row.grading_scale === null
      || row.best_grade === null
      || !isNumericScale(row.grading_scale)
      || !isKnownDiscipline(row.discipline)
    ) {
      continue;
    }
    const key = `${row.discipline}|${row.grading_scale}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        discipline: row.discipline,
        scale: row.grading_scale,
        byOrdinal: new Map(),
      };
      groups.set(key, group);
    }
    const ordinal = toOrdinal(row.month);
    const existing = group.byOrdinal.get(ordinal);
    // The RPC yields one row per month; keep the max defensively.
    if (!existing || row.best_grade > existing.grade) {
      group.byOrdinal.set(ordinal, {
        grade: row.best_grade,
        flashed: row.best_was_flash,
      });
    }
  }

  const charts: GradeProgression[] = [];
  for (const group of groups.values()) {
    const ordinals = [...group.byOrdinal.keys()];
    const last = Math.max(...ordinals);
    const first = Math.max(Math.min(...ordinals), last - (WINDOW_MONTHS - 1));

    const buckets: ProgressionBucket[] = [];
    let minGrade = Infinity;
    let maxGrade = -Infinity;
    for (let ordinal = first; ordinal <= last; ordinal++) {
      const entry = group.byOrdinal.get(ordinal) ?? null;
      if (entry) {
        minGrade = Math.min(minGrade, entry.grade);
        maxGrade = Math.max(maxGrade, entry.grade);
      }
      buckets.push({
        key: ordinalKey(ordinal),
        label: MONTH_LABEL[ordinal % 12],
        grade: entry?.grade ?? null,
        gradeLabel: entry ? formatGrade(entry.grade, group.scale) : null,
        flashed: entry?.flashed ?? false,
      });
    }

    charts.push({
      discipline: group.discipline,
      scale: group.scale,
      title: `${DISCIPLINE_LABEL[group.discipline]} · ${SCALE_LABEL[group.scale]}`,
      buckets,
      minGrade,
      maxGrade,
    });
  }

  charts.sort((a, b) => a.title.localeCompare(b.title));
  return charts;
}
