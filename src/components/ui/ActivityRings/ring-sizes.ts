/**
 * Activity-ring size scale — the single source of truth.
 *
 * Same disease `avatar-sizes.ts` was written to cure, caught earlier:
 * ring sizes were raw pixel numbers at every call site (72 in the
 * previous-sets grid and the set-detail sheet, 56 in ClimberStats,
 * 72 as the component default), so "how big is a ring on a card?"
 * had no answer and each new surface picked afresh. Adding the theme
 * preview would have made it four.
 *
 * Named by role, so there is an answer. A card is `card`.
 *
 * These stay pixel numbers rather than CSS tokens because
 * `<ActivityRings>` needs a real number: it computes stroke width,
 * ring radii and the SVG `viewBox` arithmetically from the size. A
 * custom property can't be divided in JS.
 */
export const RING_SIZES = {
  /** Theme-picker miniature — a whole card shrunk into a swatch. */
  preview: 40,
  /** Inline in a stats row where the numbers, not the rings, lead. */
  compact: 56,
  /** Standard card hero: current set, set detail, previous sets. */
  card: 72,
} as const;

export type RingSize = keyof typeof RING_SIZES;
