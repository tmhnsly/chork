import { describe, it, expect } from "vitest";
import {
  buildGradeProgression,
  type GradeProgressionRow,
} from "./grade-progression";

const row = (
  month: string,
  grade: number,
  flash = false,
  discipline = "boulder",
  scale = "v",
): GradeProgressionRow => ({
  month,
  discipline,
  grading_scale: scale,
  best_grade: grade,
  best_was_flash: flash,
});

describe("buildGradeProgression", () => {
  it("returns nothing for no rows", () => {
    expect(buildGradeProgression([])).toEqual([]);
  });

  it("fills the gap months between first and last send", () => {
    const charts = buildGradeProgression([
      row("2026-06-01", 4),
      row("2026-08-01", 6, true),
    ]);
    expect(charts).toHaveLength(1);
    const buckets = charts[0].buckets;
    expect(buckets.map((b) => b.key)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(buckets.map((b) => b.grade)).toEqual([4, null, 6]);
    expect(buckets.map((b) => b.flashed)).toEqual([false, false, true]);
    // A gap month has no grade and therefore no label.
    expect(buckets[1].gradeLabel).toBeNull();
    expect(buckets[0].gradeLabel).toBeTruthy();
  });

  it("labels buckets with short month names", () => {
    const charts = buildGradeProgression([
      row("2026-06-01", 4),
      row("2026-08-01", 6),
    ]);
    expect(charts[0].buckets.map((b) => b.label)).toEqual(["Jun", "Jul", "Aug"]);
  });

  it("keeps only the last twelve months when history runs longer", () => {
    const charts = buildGradeProgression([
      row("2025-05-01", 2), // 16 months before the last — dropped
      row("2025-09-01", 3), // exactly 12th slot from 2026-08 — kept
      row("2026-08-01", 6),
    ]);
    const keys = charts[0].buckets.map((b) => b.key);
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2025-09");
    expect(keys[11]).toBe("2026-08");
    expect(charts[0].buckets[0].grade).toBe(3);
  });

  it("does not pad before the first send", () => {
    const charts = buildGradeProgression([row("2026-08-01", 5)]);
    expect(charts[0].buckets).toHaveLength(1);
    expect(charts[0].buckets[0].key).toBe("2026-08");
  });

  it("splits one chart per (discipline, scale) and never merges", () => {
    const charts = buildGradeProgression([
      row("2026-08-01", 5, false, "boulder", "v"),
      row("2026-08-01", 12, false, "sport", "french"),
    ]);
    expect(charts).toHaveLength(2);
    const titles = charts.map((c) => c.title);
    expect(new Set(titles).size).toBe(2);
    for (const c of charts) expect(c.title).toBeTruthy();
  });

  it("spans min and max over the visible window for bar scaling", () => {
    const charts = buildGradeProgression([
      row("2026-06-01", 3),
      row("2026-07-01", 7),
      row("2026-08-01", 5),
    ]);
    expect(charts[0].minGrade).toBe(3);
    expect(charts[0].maxGrade).toBe(7);
  });

  it("ignores rows the pyramid would also refuse", () => {
    const bad: GradeProgressionRow[] = [
      { month: "2026-08-01", discipline: "speed", grading_scale: "v", best_grade: 4, best_was_flash: false },
      { month: "2026-08-01", discipline: "boulder", grading_scale: "custom", best_grade: 4, best_was_flash: false },
      { month: "2026-08-01", discipline: "boulder", grading_scale: null, best_grade: null, best_was_flash: false },
    ];
    expect(buildGradeProgression(bad)).toEqual([]);
  });
});
