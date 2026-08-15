import { describe, it, expect } from "vitest";
import {
  buildGradeDistribution,
  type GradeDistributionRow,
} from "./grade-distribution";

const row = (
  over: Partial<GradeDistributionRow> = {},
): GradeDistributionRow => ({
  discipline: "boulder",
  grading_scale: "v",
  grade: 4,
  sends: 1,
  flashes: 0,
  ...over,
});

describe("buildGradeDistribution", () => {
  it("groups into one pyramid per discipline and scale", () => {
    // Font and V are both boulder scales but not interchangeable, so
    // they are separate pyramids — never merged onto one axis.
    const { pyramids } = buildGradeDistribution([
      row({ grading_scale: "v", grade: 4, sends: 3 }),
      row({ grading_scale: "font", grade: 4, sends: 2 }),
      row({ discipline: "sport", grading_scale: "french", grade: 6, sends: 1 }),
    ]);
    expect(pyramids).toHaveLength(3);
    expect(pyramids.map((p) => p.title)).toEqual([
      "Boulder · V-scale",
      "Boulder · Font",
      "Sport · French",
    ]);
  });

  it("orders pyramids busiest first", () => {
    const { pyramids } = buildGradeDistribution([
      row({ discipline: "sport", grading_scale: "french", grade: 6, sends: 2 }),
      row({ grading_scale: "v", grade: 4, sends: 9 }),
    ]);
    expect(pyramids[0].title).toBe("Boulder · V-scale");
    expect(pyramids[0].totalSends).toBe(9);
  });

  it("reads hardest-first, so it draws as a pyramid", () => {
    const { pyramids } = buildGradeDistribution([
      row({ grade: 2, sends: 5 }),
      row({ grade: 4, sends: 1 }),
    ]);
    expect(pyramids[0].rungs.map((r) => r.grade)).toEqual([4, 3, 2]);
  });

  it("fills gaps with empty rungs", () => {
    // A hole in a pyramid says something. A sparse list of only the
    // grades you've touched doesn't.
    const { pyramids } = buildGradeDistribution([
      row({ grade: 2, sends: 4 }),
      row({ grade: 5, sends: 1 }),
    ]);
    const rungs = pyramids[0].rungs;
    expect(rungs.map((r) => r.grade)).toEqual([5, 4, 3, 2]);
    expect(rungs.find((r) => r.grade === 3)).toMatchObject({
      sends: 0,
      flashes: 0,
      label: "V3",
    });
  });

  it("labels each rung in its own scale", () => {
    const { pyramids } = buildGradeDistribution([
      row({ grading_scale: "font", grade: 10, sends: 1 }),
      row({ discipline: "sport", grading_scale: "yds", grade: 5, sends: 1 }),
    ]);
    const font = pyramids.find((p) => p.scale === "font")!;
    const yds = pyramids.find((p) => p.scale === "yds")!;
    expect(font.rungs[0].label).toBe("7A");
    expect(yds.rungs[0].label).toBe("5.10a");
  });

  it("collects ungraded sends instead of dropping them", () => {
    // The RPC returns these with a null scale and grade: a points-only
    // Set has no grades, and a custom ladder's ordinals mean something
    // different in every Match. Silently dropping them would make the
    // pyramid's total disagree with the climber's send count.
    const { pyramids, ungradedSends } = buildGradeDistribution([
      row({ grade: 4, sends: 3 }),
      row({ grading_scale: null, grade: null, sends: 7 }),
    ]);
    expect(ungradedSends).toBe(7);
    expect(pyramids).toHaveLength(1);
    expect(pyramids[0].totalSends).toBe(3);
  });

  it("treats an unknown scale or discipline as ungraded, not a crash", () => {
    // Defensive: the DB CHECKs make these unreachable today, but a
    // future scale added in SQL and not yet in TS should degrade to
    // "excluded" rather than render a broken axis.
    const { pyramids, ungradedSends } = buildGradeDistribution([
      row({ grading_scale: "britannia", grade: 3, sends: 2 }),
      row({ discipline: "trad", grading_scale: "v", grade: 3, sends: 4 }),
    ]);
    expect(pyramids).toHaveLength(0);
    expect(ungradedSends).toBe(6);
  });

  it("carries flashes alongside sends without double counting", () => {
    // Flashes are a SUBSET of sends — the bar is sends long, with the
    // flash portion tinted inside it. If they were added the bar
    // would overflow its own total.
    const { pyramids } = buildGradeDistribution([
      row({ grade: 4, sends: 5, flashes: 2 }),
    ]);
    expect(pyramids[0].totalSends).toBe(5);
    expect(pyramids[0].totalFlashes).toBe(2);
    expect(pyramids[0].rungs[0]).toMatchObject({ sends: 5, flashes: 2 });
  });

  it("sums duplicate rows for the same grade", () => {
    const { pyramids } = buildGradeDistribution([
      row({ grade: 4, sends: 2, flashes: 1 }),
      row({ grade: 4, sends: 3, flashes: 2 }),
    ]);
    expect(pyramids[0].rungs).toHaveLength(1);
    expect(pyramids[0].rungs[0]).toMatchObject({ sends: 5, flashes: 3 });
  });

  it("keeps maxSends at least 1 so a bar never divides by zero", () => {
    const { pyramids } = buildGradeDistribution([row({ grade: 4, sends: 0 })]);
    expect(pyramids[0].maxSends).toBe(1);
  });

  it("returns nothing for a climber with no sends", () => {
    expect(buildGradeDistribution([])).toEqual({
      pyramids: [],
      ungradedSends: 0,
    });
  });
});
