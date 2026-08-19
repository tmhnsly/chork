import { CardSkeleton } from "@/components/ui";
import { ProfileHeroSkeleton } from "@/components/ProfileHero/ProfileHeroSkeleton";
import { BadgeShelfSkeleton } from "@/components/ui/BadgeShelf/BadgeShelfSkeleton";
import { StatsWidgetSkeleton } from "@/components/ui/StatsWidget/StatsWidgetSkeleton";
import { PROFILE_SECTION_HEIGHTS } from "./_components/sectionHeights";
import styles from "./loading.module.scss";

/**
 * Profile skeleton.
 *
 * Two kinds of stand-in. The hero, the current-set card and the
 * achievements shelf render their REAL layout with blank content
 * under one shimmer (`ProfileHeroSkeleton`, `StatsWidgetSkeleton`,
 * `BadgeShelfSkeleton`), because all three change height with the
 * width they land in — the handle drops a type step on a phone, the
 * ring gives way beside the stats, the shelf is six-across on a
 * tablet and three-by-two on a phone — and only the same layout can
 * follow that. The rest are single card-shaped blocks at a measured
 * height; their real cards do not reflow, so a block is enough and
 * fewer moving parts means less visible pop when data hydrates.
 */
export default function ProfileLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading profile">
      <ProfileHeroSkeleton />
      <StatsWidgetSkeleton />
      <BadgeShelfSkeleton />
      {/* Grades, not Sets. Sets is history and most profiles have
          none yet, so a reserved block there is a jump on hand-off;
          Grades renders for anyone who has sent a graded route, which
          is nearly everyone past their first session. */}
      <CardSkeleton height={PROFILE_SECTION_HEIGHTS.grades} ariaLabel="Loading grades" />
    </main>
  );
}
