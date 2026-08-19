import { describe, expect, it } from "vitest";
import type { BadgeStatus, ProgressBadgeDefinition } from "@/lib/badges";
import type { AchievementActivity } from "@/lib/data/achievement-queries";
import { pickShelfBadges, SHELF_SLOTS } from "./shelf";

/**
 * The profile shelf's rule is RECENCY of activity — Tom corrected an
 * earlier "closest to earning" draft to this, twice. These pin the
 * rule so a well-meaning "sort by progress" never comes back.
 */

const def = (
  id: string,
  progressKey: ProgressBadgeDefinition["progressKey"],
  extra: Partial<ProgressBadgeDefinition> = {},
): ProgressBadgeDefinition => ({
  kind: "progress",
  id,
  progressKey,
  target: 10,
  name: id,
  description: id,
  icon: "bolt",
  tier: "bronze",
  category: "sends",
  ...extra,
});

const earned = (id: string, earnedAt: string, extra?: Partial<ProgressBadgeDefinition>): BadgeStatus => ({
  badge: def(id, "sends", extra),
  earned: true,
  earnedAt,
});

const inProgress = (
  id: string,
  progressKey: ProgressBadgeDefinition["progressKey"],
  current: number,
  extra?: Partial<ProgressBadgeDefinition>,
): BadgeStatus => ({
  badge: def(id, progressKey, extra),
  earned: false,
  current,
  progress: current / 10,
});

const quiet: AchievementActivity = {
  last_flash_on: null,
  last_send_on: null,
  last_match_on: null,
};

describe("pickShelfBadges", () => {
  it("ranks by recency, not by how close to the target", () => {
    // Nudged yesterday at 1/10 vs untouched at 9/10 last month.
    const badges = [
      inProgress("nearly", "matches_played", 9),
      inProgress("nudged", "sends", 1),
    ];
    const activity: AchievementActivity = {
      ...quiet,
      last_send_on: "2026-08-18",
      last_match_on: "2026-07-01",
    };
    expect(pickShelfBadges(badges, activity, 1).map((b) => b.badge.id)).toEqual(["nudged"]);
  });

  it("interleaves earned and in-progress by their one date", () => {
    const badges = [
      earned("old-win", "2026-06-01"),
      inProgress("recent-nudge", "flashes", 2),
      earned("new-win", "2026-08-10"),
    ];
    const activity = { ...quiet, last_flash_on: "2026-08-15" };
    expect(pickShelfBadges(badges, activity).map((b) => b.badge.id)).toEqual([
      "recent-nudge",
      "new-win",
      "old-win",
    ]);
  });

  it("breaks a tie by catalogue order so a ladder reads ascending", () => {
    // Three send badges all moved by the same send.
    const badges = [
      inProgress("sends-10", "sends", 3),
      inProgress("sends-50", "sends", 3),
      inProgress("sends-100", "sends", 3),
    ];
    const activity = { ...quiet, last_send_on: "2026-08-18" };
    expect(pickShelfBadges(badges, activity).map((b) => b.badge.id)).toEqual([
      "sends-10",
      "sends-50",
      "sends-100",
    ]);
  });

  it("never shows an unearned secret — ranked or as fill", () => {
    const badges = [
      inProgress("secret-live", "sends", 5, { isSecret: true }),
      inProgress("secret-zero", "sends", 0, { isSecret: true }),
      inProgress("plain", "sends", 0),
    ];
    const activity = { ...quiet, last_send_on: "2026-08-18" };
    expect(pickShelfBadges(badges, activity).map((b) => b.badge.id)).toEqual(["plain"]);
  });

  it("shows an earned secret like any earned badge", () => {
    const badges = [earned("revealed", "2026-08-01", { isSecret: true })];
    expect(pickShelfBadges(badges, quiet).map((b) => b.badge.id)).toEqual(["revealed"]);
  });

  it("fills the row from the catalogue when activity cannot, activity first", () => {
    // Two things with history, five slots: the row is still five.
    const badges = [
      inProgress("a-zero", "sends", 0),
      inProgress("b-zero", "sends", 0),
      earned("won", "2026-08-01"),
      inProgress("c-zero", "sends", 0),
      inProgress("moved", "flashes", 1),
      inProgress("d-zero", "sends", 0),
    ];
    const activity = { ...quiet, last_flash_on: "2026-08-18" };
    const ids = pickShelfBadges(badges, activity).map((b) => b.badge.id);
    expect(ids).toHaveLength(SHELF_SLOTS);
    // Activity leads; the fill is catalogue order from the top,
    // skipping what is already on the shelf.
    expect(ids).toEqual(["moved", "won", "a-zero", "b-zero", "c-zero"]);
  });

  it("fills touched ladders before untouched ones", () => {
    // Nothing dated at all (no earned dates, no activity), so it is
    // ALL fill — and a ladder someone has started belongs ahead of one
    // they have not, whatever the catalogue order says.
    const badges = [
      inProgress("a-zero", "sends", 0),
      inProgress("b-half", "sends", 5),
      inProgress("c-zero", "sends", 0),
      inProgress("d-one", "matches_played", 1),
    ];
    expect(pickShelfBadges(badges, quiet).map((b) => b.badge.id)).toEqual([
      "b-half",
      "d-one",
      "a-zero",
      "c-zero",
    ]);
  });

  it("with no activity (a visited profile), ranks earned by day and never dates progress", () => {
    // Migration 132: when a ladder last moved is the owner's business.
    // A visitor's shelf still shows earned badges newest first, and
    // in-progress ones through the fill — but nothing here could have
    // read a date a visitor is not allowed to know.
    const badges = [
      inProgress("nudged", "sends", 3),
      earned("older", "2026-08-01"),
      earned("newer", "2026-08-10"),
      inProgress("zero", "sends", 0),
    ];
    expect(pickShelfBadges(badges, null).map((b) => b.badge.id)).toEqual([
      "newer",
      "older",
      "nudged",
      "zero",
    ]);
  });

  it("compares by DAY, so a clock time never out-ranks a date on the same day", () => {
    // Earned dates arrive as YYYY-MM-DD from the RPC now, but an ISO
    // string from an older fixture must not sort as "later" than a
    // date-only string for the same day.
    const badges = [
      earned("iso", "2026-08-10T23:59:00Z"),
      inProgress("nudged", "flashes", 1),
    ];
    const activity = { ...quiet, last_flash_on: "2026-08-10" };
    // Same day → tie → catalogue order.
    expect(pickShelfBadges(badges, activity).map((b) => b.badge.id)).toEqual(["iso", "nudged"]);
  });

  it("an earned badge with no date is fill, not ranked — undated cannot be 'recent'", () => {
    // The wall never persisted a badge before 132's app-side fix, so
    // every earned-but-undated badge is exactly this case, and it must
    // still make the shelf ahead of untouched ladders.
    const badges = [
      inProgress("zero", "sends", 0),
      { badge: def("undated", "sends"), earned: true as const },
      earned("dated", "2026-08-01"),
    ];
    expect(pickShelfBadges(badges, quiet).map((b) => b.badge.id)).toEqual([
      "dated",
      "undated",
      "zero",
    ]);
  });

  it("returns fewer than the slots only when the catalogue itself is short", () => {
    const badges = [inProgress("only", "sends", 0)];
    expect(pickShelfBadges(badges, quiet)).toHaveLength(1);
  });

  it("caps at the slot count when activity alone overflows it", () => {
    const badges = Array.from({ length: 8 }, (_, i) => earned(`w${i}`, `2026-08-0${i + 1}`));
    const ids = pickShelfBadges(badges, quiet).map((b) => b.badge.id);
    expect(ids).toEqual(["w7", "w6", "w5", "w4", "w3"]);
  });
});
