/**
 * Count nouns, pluralised.
 *
 * Exists because "1 sends" turned up on the Match result board and the
 * same mistake was sitting in a dozen other places — most of them
 * screen-reader labels, where nobody would ever have spotted it.
 *
 * Deliberately not an i18n library. Chork is English-only today, and a
 * full plural-rules implementation would be a much larger interface
 * (locale, plural categories, ordinals) for a job this is doing fine.
 * If a second language ever lands, this is the one place to swap.
 */

/**
 * The right form of `singular` for `count`.
 *
 * Defaults to `+s`, which is wrong often enough — flash/flashes,
 * match/matches — that the third argument is not optional-in-practice
 * for those words. Callers pass it; the sites that need it are named
 * in `plural.test.ts` so a new one can't be added silently.
 */
export function plural(
  count: number,
  singular: string,
  pluralForm?: string,
): string {
  return Math.abs(count) === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/**
 * `count` and its noun together — "3 sends", "1 send".
 *
 * The common case, and the one worth having a name for: it keeps the
 * number and the noun that agrees with it in a single expression, so
 * they cannot drift apart in a later edit.
 */
export function countOf(
  count: number,
  singular: string,
  pluralForm?: string,
): string {
  return `${count} ${plural(count, singular, pluralForm)}`;
}

/**
 * Same, for an already-formatted number.
 *
 * Handicapped totals arrive as strings ("2.8") because they are
 * formatted in tenths before display, and `Number("2.8") === 1` is the
 * only question that matters here. Anything non-numeric is treated as
 * plural, which is the safe fallback for a display string.
 */
export function countOfFormatted(
  value: number | string,
  singular: string,
  pluralForm?: string,
): string {
  const n = typeof value === "number" ? value : Number(value);
  return `${value} ${plural(Number.isNaN(n) ? 0 : n, singular, pluralForm)}`;
}
