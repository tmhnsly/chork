import { describe, it, expect } from "vitest";
import { momentCopy, type Moment } from "./moments";
import { ACHIEVEMENTS } from "@/config/achievements";

function moment(over: Partial<Moment> & Pick<Moment, "kind" | "detail">): Moment {
  return {
    user_id: "u1",
    username: "nat",
    name: "Nat",
    avatar_url: null,
    occurred_on: "2026-08-14",
    ...over,
  };
}

describe("momentCopy", () => {
  it("names the grade in the scale it was climbed on", () => {
    // The grade is an ordinal into ITS OWN Set's scale, so the scale
    // has to travel with it — a V-scale 5 and a font 5 are different
    // climbs, which is also why the SQL partitions bests by scale.
    const v = momentCopy(
      moment({ kind: "personal_best", detail: { grade: 5, grading_scale: "v" } }),
    );
    const font = momentCopy(
      moment({ kind: "personal_best", detail: { grade: 5, grading_scale: "font" } }),
    );
    expect(v?.text).toContain("V5");
    expect(font?.text).not.toBe(v?.text);
  });

  it("reads the same whether or not they had climbed the scale before", () => {
    // "their first 6a+" is literally true either way.
    const first = momentCopy(
      moment({
        kind: "personal_best",
        detail: { grade: 4, grading_scale: "v", first_ever: true },
      }),
    );
    const better = momentCopy(
      moment({
        kind: "personal_best",
        detail: { grade: 4, grading_scale: "v", first_ever: false },
      }),
    );
    expect(first?.text).toBe(better?.text);
  });

  it("counts opponents, not players, for a match win", () => {
    // "won against 3 others" from a 4-player match. Saying "against 4"
    // would be counting the winner as their own opponent.
    const copy = momentCopy(
      moment({
        kind: "match_placed",
        detail: { match_name: "Friday sesh", player_count: 4, rank: 1 },
      }),
    );
    expect(copy?.text).toContain("against 3 others");
    expect(copy?.text).toContain("Friday sesh");
  });

  it("drops the opponent clause for a solo match", () => {
    const copy = momentCopy(
      moment({ kind: "match_placed", detail: { player_count: 1, rank: 1 } }),
    );
    expect(copy?.text).not.toContain("against");
  });

  it("says a match podium as a placing, and a win as a win", () => {
    // Rank 1 keeps the sentence match_won had — the rename lost
    // nothing. 2nd and 3rd read as placings, because "results" means
    // how your friends did, not only who won.
    const second = momentCopy(
      moment({
        kind: "match_placed",
        detail: { match_name: "Friday sesh", player_count: 5, rank: 2 },
      }),
    );
    expect(second?.text).toBe("came 2nd of 5 in a match at Friday sesh");
    expect(second?.icon).toBe("podium");
    const first = momentCopy(
      moment({ kind: "match_placed", detail: { player_count: 5, rank: 1 } }),
    );
    expect(first?.text).toContain("won a match");
    expect(first?.icon).toBe("crown");
  });

  it("refuses a match placing off the podium", () => {
    // The SQL only emits rank <= 3, but a row can outlive the rule
    // that produced it. Nobody's highlight reel says "came 7th".
    expect(
      momentCopy(moment({ kind: "match_placed", detail: { rank: 7 } })),
    ).toBeNull();
  });

  it("names the set and the gym for a set placing", () => {
    // The kind that shows a friend at ANOTHER gym doing well — the
    // gym has to be in the sentence or it is just a number.
    const copy = momentCopy(
      moment({
        kind: "set_placed",
        detail: { set_name: "August", gym_name: "Yonder", rank: 3 },
      }),
    );
    expect(copy?.text).toBe("finished 3rd on August at Yonder");
  });

  it("names a real badge and ignores one that no longer exists", () => {
    const real = ACHIEVEMENTS[0];
    expect(
      momentCopy(moment({ kind: "achievement", detail: { badge_id: real.id } }))
        ?.text,
    ).toContain(real.name);
    // A badge removed from the config outlives nothing — the row is
    // derived, so it must not render half a sentence.
    expect(
      momentCopy(moment({ kind: "achievement", detail: { badge_id: "gone" } })),
    ).toBeNull();
  });

  it("only speaks of podium places", () => {
    // The SQL only returns the top 3, but the renderer refuses
    // anything else too — "finished 47th" is a fact, not a moment.
    expect(
      momentCopy(
        moment({ kind: "competition_placing", detail: { rank: 1, competition_name: "Winter" } }),
      )?.text,
    ).toContain("1st");
    expect(
      momentCopy(moment({ kind: "competition_placing", detail: { rank: 9 } })),
    ).toBeNull();
  });

  it("returns null rather than throwing on a kind it doesn't know", () => {
    // Moments are derived from live rows, so a row can outlive the
    // client that renders it. One unknown kind must not blank the
    // whole feed.
    expect(
      momentCopy(moment({ kind: "wingsuited" as never, detail: {} })),
    ).toBeNull();
  });

  it("survives a malformed payload", () => {
    // `detail` is jsonb — nothing at the type level stops a bad shape.
    expect(momentCopy(moment({ kind: "personal_best", detail: {} }))).toBeNull();
    expect(
      momentCopy(moment({ kind: "personal_best", detail: { grade: "five" } })),
    ).toBeNull();
    expect(momentCopy(moment({ kind: "achievement", detail: {} }))).toBeNull();
  });

  it("never links somewhere a guest handle would 404", () => {
    // A moment always belongs to an account — guests can't earn one —
    // but the row still refuses to build /u/undefined.
    const copy = momentCopy(
      moment({
        kind: "personal_best",
        username: null,
        detail: { grade: 3, grading_scale: "v" },
      }),
    );
    expect(copy?.href).toBeNull();
  });
});
