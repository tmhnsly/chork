import { differenceInCalendarDays, format, parseISO } from "date-fns";

/**
 * Display label for a set. If the set has an explicit `name`, that wins.
 * Otherwise we format the date range — "APR 7 – MAY 4" — to match the
 * pattern already used on the profile page and PreviousSetsGrid.
 *
 * Single source of truth for set display so admin pages, climber
 * history cards, and the leaderboard all render the same label.
 */
export function formatSetLabel(
  set: { name?: string | null; starts_at: string; ends_at: string }
): string {
  const trimmed = set.name?.trim();
  if (trimmed) return trimmed;
  return [
    format(parseISO(set.starts_at), "MMM d").toUpperCase(),
    format(parseISO(set.ends_at), "MMM d").toUpperCase(),
  ].join(" – ");
}

/**
 * Countdown label for how long until a set resets. Takes an ISO
 * `ends_at` timestamp and returns a short relative string:
 *   - 0 days  → "today"
 *   - 1 day   → "1d"
 *   - 2-6 days → "4d"
 *   - exact weeks → "2w"
 *   - weeks + days → "2w5d"
 *   - already passed → "ended"
 *
 * Used by SetMeta callers so the current-set card reads "Resets in
 * 2w5d" rather than an absolute date that the reader has to do mental
 * maths against. Calendar-day diff is intentional (not hour-precise)
 * — matches how climbers think about set length.
 */
export function formatSetResetCountdown(endsAtISO: string): string {
  const days = differenceInCalendarDays(parseISO(endsAtISO), new Date());
  if (days < 0) return "ended";
  if (days === 0) return "today";
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  const remainder = days % 7;
  return remainder === 0 ? `${weeks}w` : `${weeks}w${remainder}d`;
}
