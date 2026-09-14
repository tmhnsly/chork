/**
 * What a match is called, everywhere it is named.
 *
 * Matches are created with a stored name now ("Tom's match"), so the
 * fallback is for rows from before that — one home for the word, so
 * the five lists that used to each write it stay in step.
 */
export function matchTitle(match: { name: string | null }): string {
  return match.name?.trim() || "Untitled match";
}
