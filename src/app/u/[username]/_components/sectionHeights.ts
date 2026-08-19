/**
 * Skeleton heights for the profile sections.
 *
 * Single source of truth — used by both `loading.tsx` (the route-level
 * skeleton that renders before any RSC resolves) AND the per-section
 * Suspense fallbacks in `page.tsx` / `ProfileStats.skeleton.tsx`.
 *
 * Drift between the two surfaces was the original layout-shift cause:
 * loading.tsx painted the page at one height, then the Suspense
 * fallback handed off at a different height. Keep them aligned.
 *
 * Measured against a populated profile in the browser on 2026-08-19,
 * after the hero card replaced the header + all-time pair. The old
 * values described a page that no longer existed — a bare header and
 * a 21rem all-time card — so the skeleton drew two blocks where there
 * is now one, at heights nothing on the page matched.
 */
export const PROFILE_SECTION_HEIGHTS = {
  /**
   * The hero card: identity, three headline stats, the ratio line and
   * the action row. Measured 19.3rem with the ratio line present; a
   * brand-new profile with no sends omits that line and is a rung
   * shorter, which is the smaller shift to accept.
   */
  hero: "19.5rem",
  /** Current-set card (rings + mini grid + reset date). */
  currentSet: "15.5rem",
  /** Achievements shelf, with the horizontal row of cards. */
  achievements: "12rem",
  /** Previous-sets list. */
  previousSets: "11rem",
} as const;
