/**
 * Skeleton heights for the profile sections that stand in as a plain
 * card-shaped block.
 *
 * Single source of truth — used by both `loading.tsx` (the route-level
 * skeleton that renders before any RSC resolves) AND the per-section
 * Suspense fallbacks in `page.tsx`. Drift between the two surfaces was
 * the original layout-shift cause: loading.tsx painted the page at one
 * height, then the Suspense fallback handed off at a different height.
 * Keep them aligned.
 *
 * Not every section is here. The hero, the current-set card and the
 * achievements shelf change height with the width they land in, so
 * their skeletons are the real layout with blank content
 * (`ProfileHeroSkeleton`, `StatsWidgetSkeleton`, `BadgeShelfSkeleton`)
 * — a fixed rem could only ever match one width.
 *
 * Measured against a populated profile in the browser on 2026-08-19,
 * after the hero card replaced the header + all-time pair.
 */
export const PROFILE_SECTION_HEIGHTS = {
  /**
   * Previous sets — history only, and the section is ABSENT until a
   * climber has a set behind them, so the route skeleton does not
   * reserve it: reserving a block that most profiles never fill is a
   * guaranteed jump on hand-off. Only the per-section Suspense
   * fallback uses this, and page.tsx mounts that boundary only when
   * `orderedSets` says there is a previous set to draw.
   */
  previousSets: "15rem",
  /** Grades pyramid card. Self-hides with nothing graded. */
  grades: "9rem",
} as const;
