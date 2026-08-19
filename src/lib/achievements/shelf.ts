import type { BadgeStatus, ProgressKey } from "@/lib/badges";
import type { AchievementActivity } from "@/lib/data/achievement-queries";

/** How many badges the profile shelf shows before "View all". */
export const SHELF_SLOTS = 5;

/**
 * Which activity date moves a ladder. A flash is a send and points
 * move with sends, so six keys share three dates.
 */
function lastActivityFor(
  key: ProgressKey,
  activity: AchievementActivity,
): string | null {
  switch (key) {
    case "flashes":
      return activity.last_flash_on;
    case "sends":
    case "points":
      return activity.last_send_on;
    case "matches_played":
    case "matches_won":
    case "matches_hosted":
      return activity.last_match_on;
  }
}

/**
 * Everything the shelf compares is a DAY. Earned dates arrive as
 * `YYYY-MM-DD` from the RPC; activity dates too. Anything longer (an
 * ISO timestamp from an older caller, a story fixture) is cut to its
 * day so a clock time can never out-rank a date on the same day.
 */
const day = (at: string) => at.slice(0, 10);

/**
 * The badges that belong on the profile shelf, most recent first.
 *
 * Tom's rule: RECENCY of activity, not proximity to the target. A
 * badge you nudged yesterday at 3/50 outranks one sitting untouched at
 * 49/50 for a month, because the shelf shows what you have been DOING.
 * So every candidate gets one date — when it was earned, or when its
 * ladder last moved — and the shelf is the top N by that date.
 *
 * Only badges with SOME activity qualify for that ranking: an earned
 * one, or an in-progress one whose ladder has moved at least once. A
 * badge at 0 with no history has nothing recent about it.
 *
 * `activity` is null on a VISITED profile: when a ladder last moved is
 * the owner's own business (migration 132), so a visitor's shelf ranks
 * by earned dates alone. In-progress badges still make the shelf there
 * — through the fill, which prefers touched ladders — they just cannot
 * out-rank an earned one by recency nobody may know.
 *
 * The shelf is a fixed row, and a fixed row with gaps reads as broken
 * — a climber with three achievements to their name saw three cards,
 * "+24 more" and an empty slot. So when the ranking cannot fill it,
 * the tail is topped up from the catalogue: ladders with progress
 * first (in catalogue order), then the untouched, so a new climber
 * sees "here is what to go for" and someone mid-ladder sees the ladder.
 * Activity always ranks ahead of the fill; the fill never displaces it.
 *
 * Secrets stay hidden until earned, as everywhere — never ranked,
 * never used as fill.
 *
 * Ties (same day, e.g. several send badges moved by one send) fall
 * back to catalogue order, so the ladder reads ascending.
 */
export function pickShelfBadges(
  badges: BadgeStatus[],
  activity: AchievementActivity | null,
  slots = SHELF_SLOTS,
): BadgeStatus[] {
  const order = new Map(badges.map((b, i) => [b.badge.id, i]));
  const byCatalogue = (x: BadgeStatus, y: BadgeStatus) =>
    (order.get(x.badge.id) ?? 0) - (order.get(y.badge.id) ?? 0);

  const dated: { b: BadgeStatus; at: string }[] = [];
  for (const b of badges) {
    if (b.badge.isSecret && !b.earned) continue;
    if (b.earned) {
      if (b.earnedAt) dated.push({ b, at: day(b.earnedAt) });
      continue;
    }
    if (!activity) continue;
    if (b.badge.kind !== "progress") continue;
    if ((b.current ?? 0) <= 0) continue;
    const at = lastActivityFor(b.badge.progressKey, activity);
    if (at) dated.push({ b, at: day(at) });
  }

  dated.sort((x, y) => (x.at !== y.at ? y.at.localeCompare(x.at) : byCatalogue(x.b, y.b)));

  const picked = dated.slice(0, slots).map((d) => d.b);
  if (picked.length >= slots) return picked;

  const taken = new Set(picked.map((b) => b.badge.id));
  const eligible = badges.filter((b) => !taken.has(b.badge.id) && !(b.badge.isSecret && !b.earned));
  const touched = (b: BadgeStatus) =>
    b.earned || (b.badge.kind === "progress" && (b.current ?? 0) > 0);
  const fill = [
    ...eligible.filter(touched).sort(byCatalogue),
    ...eligible.filter((b) => !touched(b)).sort(byCatalogue),
  ];
  for (const b of fill) {
    if (picked.length >= slots) break;
    picked.push(b);
  }
  return picked;
}
