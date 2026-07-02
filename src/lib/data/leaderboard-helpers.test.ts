import { describe, expect, it } from "vitest";
import { normaliseRankedRows, type RawRankedRow } from "./leaderboard-helpers";

function mkRaw(rank: number | string | null): RawRankedRow {
  return {
    user_id: "u1",
    username: "tom",
    name: "Tom",
    avatar_url: "",
    rank,
    sends: 3,
    flashes: 1,
    zones: 2,
    points: 12,
  };
}

describe("normaliseRankedRows", () => {
  it("coerces a bigint-as-string rank to a number", () => {
    const [row] = normaliseRankedRows([mkRaw("7")]);
    expect(row.rank).toBe(7);
  });

  it("passes a numeric rank through unchanged", () => {
    const [row] = normaliseRankedRows([mkRaw(3)]);
    expect(row.rank).toBe(3);
  });

  it("keeps a null rank null (unranked, not NaN or 0)", () => {
    const [row] = normaliseRankedRows([mkRaw(null)]);
    expect(row.rank).toBeNull();
  });

  it("leaves the other columns untouched", () => {
    const [row] = normaliseRankedRows([mkRaw("1")]);
    expect(row).toEqual({ ...mkRaw("1"), rank: 1 });
  });

  it("passes extra fields through (competition/crew rows)", () => {
    const rows = normaliseRankedRows([
      { ...mkRaw("2"), category_id: "cat-1" as string | null },
    ]);
    expect(rows[0].category_id).toBe("cat-1");
    expect(rows[0].rank).toBe(2);
  });
});
