/**
 * The OG/Twitter card palette — the ONE place app code may spell a
 * colour as a literal.
 *
 * Why literals at all: these images render server-side through
 * Satori, where no stylesheet cascade exists — `var(--accent-solid)`
 * is nothing there. So the brand's poster look (the Chork chord's
 * dark end: olive blacks, neon lime) is captured once, here, with
 * this reason attached — exactly what CLAUDE.md's raw-value rule
 * asks for. `design-system.test.ts` bans hex everywhere else in
 * app code, which is what keeps this module the one door.
 *
 * Deliberately NOT theme-aware: a share card is the brand's face on
 * someone else's feed, not the sharer's palette.
 */
export const OG = {
  /** Poster ground — olive-dark app black. */
  bg: "#111210",
  /** Primary text on the poster. (Two near-whites had drifted across
   *  the routes; this is the survivor.) */
  fg: "#ecedeb",
  /** The brand lime — accent step 9's dark-scheme voice. */
  accent: "#bdee63",
  /** Text sitting ON the accent. */
  onAccent: "#111210",
  /** Secondary text. */
  muted: "#a3a8a0",
  /** Tertiary / footer text. */
  low: "#7c8378",
} as const;
