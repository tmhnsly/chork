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
  last_flash_at: null,
  last_send_at: null,
  last_match_at: null,
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
      last_send_at: "2026-08-18T00:00:00Z",
      last_match_at: "2026-07-01T00:00:00Z",
    };
    expect(pickShelfBadges(badges, activity, 1).map((b) => b.badge.id)).toEqual(["nudged"]);
  });

  it("interleaves earned and in-progress by their one date", () => {
    const badges = [
      earned("old-win", "2026-06-01T00:00:00Z"),
      inProgress("recent-nudge", "flashes", 2),
      earned("new-win", "2026-08-10T00:00:00Z"),
    ];
    const activity = { ...quiet, last_flash_at: "2026-08-15T00:00:00Z" };
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
    const activity = { ...quiet, last_send_at: "2026-08-18T00:00:00Z" };
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
    const activity = { ...quiet, last_send_at: "2026-08-18T00:00:00Z" };
    expect(pickShelfBadges(badges, activity).map((b) => b.badge.id)).toEqual(["plain"]);
  });

  it("shows an earned secret like any earned badge", () => {
    const badges = [earned("revealed", "2026-08-01T00:00:00Z", { isSecret: true })];
    expect(pickShelfBadges(badges, quiet).map((b) => b.badge.id)).toEqual(["revealed"]);
  });

  it("fills the row from the catalogue when activity cannot, activity first", () => {
    // Two things with history, five slots: the row is still five.
    const badges = [
      inProgress("a-zero", "sends", 0),
      inProgress("b-zero", "sends", 0),
      earned("won", "2026-08-01T00:00:00Z"),
      inProgress("c-zero", "sends", 0),
      inProgress("moved", "flashes", 1),
      inProgress("d-zero", "sends", 0),
    ];
    const activity = { ...quiet, last_flash_at: "2026-08-18T00:00:00Z" };
    const ids = pickShelfBadges(badges, activity).map((b) => b.badge.id);
    expect(ids).toHaveLength(SHELF_SLOTS);
    // Activity leads; the fill is catalogue order from the top,
    // skipping what is already on the shelf.
    expect(ids).toEqual(["moved", "won", "a-zero", "b-zero", "c-zero"]);
  });

  it("returns fewer than the slots only when the catalogue itself is short", () => {
    const badges = [inProgress("only", "sends", 0)];
    expect(pickShelfBadges(badges, quiet)).toHaveLength(1);
  });

  it("caps at the slot count when activity alone overflows it", () => {
    const badges = Array.from({ length: 8 }, (_, i) =>
      earned(`w${i}`, `2026-08-0${i + 1}T00:00:00Z`),
    );
    const ids = pickShelfBadges(badges, quiet).map((b) => b.badge.id);
    expect(ids).toEqual(["w7", "w6", "w5", "w4", "w3"]);
  });
});
