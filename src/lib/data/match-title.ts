/**
 * What a match is called, everywhere it is named.
 *
 * Games are created with a stored name now ("Tom's game"), so the
 * fallback is for rows from before that — one home for the word, so
 * the five lists that used to each write it stay in step.
 */
export function matchTitle(match: { name: string | null }): string {
  return match.name?.trim() || "Untitled game";
}

/**
 * The name a new game starts with on its setup page: "Tom's game",
 * after the climber's first name, or their username when they have
 * none. It is stored when the game starts, so lists show a name rather
 * than the fallback above.
 */
export function defaultGameName(
  profile: { name?: string | null; username?: string | null } | null | undefined,
): string {
  const firstName = profile?.name?.trim().split(/\s+/)[0] || profile?.username?.trim() || "";
  return firstName ? `${firstName}'s game` : "My game";
}
