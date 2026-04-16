/**
 * Skeleton heights for the four profile sections.
 *
 * Single source of truth — used by both `loading.tsx` (the route-level
 * skeleton that renders before any RSC resolves) AND the per-section
 * Suspense fallbacks in `page.tsx` / `ProfileStats.skeleton.tsx`.
 *
 * Drift between the two surfaces was the original layout-shift cause:
 * loading.tsx painted the page at one height, then the Suspense
 * fallback handed off at a different height. Keep them aligned.
 *
 * Tune by measuring the populated section in the browser, then
 * updating here. Both render sites pick up the new value.
 */
export const PROFILE_SECTION_HEIGHTS = {
  /** All-time stats card (rings + numbers + extras list). */
  allTime: "21rem",
  /** Current-set card (mini grid + reset date). */
  currentSet: "18rem",
  /** Achievements shelf — empty state shorter than full earned list. */
  achievements: "8rem",
  /** Previous-sets grid — taller than other sections, biases toward
   *  larger so shrinking content doesn't pull the page up. */
  previousSets: "16rem",
} as const;
