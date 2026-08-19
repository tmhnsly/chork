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
      return activity.last_flash_at;
    case "sends":
    case "points":
      return activity.last_send_at;
    case "matches_played":
    case "matches_won":
    case "matches_hosted":
      return activity.last_match_at;
  }
}

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
 * But the shelf is a fixed row, and a fixed row with gaps reads as
 * broken — a climber with three achievements to their name saw three
 * cards, "+24 more" and an empty slot. So when activity alone cannot
 * fill it, the tail is topped up with the next badges in catalogue
 * order: for a new climber that is "here is what to go for", which is
 * the right thing to say to someone with no history yet. Activity
 * always ranks ahead of the fill; the fill never displaces it.
 *
 * Secrets stay hidden until earned, as everywhere — they are never
 * ranked and never used as fill.
 *
 * Ties (same date, e.g. several send badges moved by one send) fall
 * back to catalogue order, so the ladder reads ascending.
 */
export function pickShelfBadges(
  badges: BadgeStatus[],
  activity: AchievementActivity,
  slots = SHELF_SLOTS,
): BadgeStatus[] {
  const order = new Map(badges.map((b, i) => [b.badge.id, i]));

  const dated: { b: BadgeStatus; at: string }[] = [];
  for (const b of badges) {
    if (b.badge.isSecret && !b.earned) continue;
    if (b.earned) {
      dated.push({ b, at: b.earnedAt ?? "" });
      continue;
    }
    if (b.badge.kind !== "progress") continue;
    if ((b.current ?? 0) <= 0) continue;
    const at = lastActivityFor(b.badge.progressKey, activity);
    if (at) dated.push({ b, at });
  }

  dated.sort((x, y) => {
    if (x.at !== y.at) return y.at.localeCompare(x.at);
    return (order.get(x.b.badge.id) ?? 0) - (order.get(y.b.badge.id) ?? 0);
  });

  const picked = dated.slice(0, slots).map((d) => d.b);
  if (picked.length >= slots) return picked;

  const taken = new Set(picked.map((b) => b.badge.id));
  for (const b of badges) {
    if (picked.length >= slots) break;
    if (taken.has(b.badge.id)) continue;
    if (b.badge.isSecret && !b.earned) continue;
    picked.push(b);
  }
  return picked;
}
