import { format, parseISO } from "date-fns";

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
