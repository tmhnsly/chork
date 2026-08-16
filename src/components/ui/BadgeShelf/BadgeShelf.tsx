"use client";

import { useMemo } from "react";
import type { BadgeStatus } from "@/lib/badges";
import { AchievementCard } from "@/components/ui/AchievementCard/AchievementCard";
import { BrandDivider } from "@/components/ui/BrandDivider";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import styles from "./badgeShelf.module.scss";

interface Props {
  badges: BadgeStatus[];
  /** Called when the user taps the header count OR the "+N more"
   *  pill at the end of the shelf. Opens the full catalogue. */
  onSeeAll?: () => void;
  /** Called when the user taps an individual badge slot. Parent
   *  owns the detail sheet — keeps BadgeShelf presentational and
   *  decoupled from the Achievements feature folder. */
  onTapBadge?: (badge: BadgeStatus) => void;
}

export function BadgeShelf({ badges, onSeeAll, onTapBadge }: Props) {
  // Shelf contents — earned achievements plus the NEXT unearned tier
  // in each progress ladder (flashes / sends / points). Condition-
  // based locked achievements (Saviour, Not Easy Being Green, rhyme
  // pairs…) and further-future milestones in the ladders roll into
  // the trailing "+N more" pill so the shelf stays focused on
  // "what I've done" and "what's up next".
  const { visible, remainingCount, totalEarned } = useMemo(() => {
    const earned = badges
      .filter((b) => b.earned)
      .sort((a, b) => {
        const aDate = a.earned && a.earnedAt ? a.earnedAt : "";
        const bDate = b.earned && b.earnedAt ? b.earnedAt : "";
        return bDate.localeCompare(aDate);
      });

    // Next unearned tier per progress ladder. Only progress badges
    // have a ladder; condition badges fall into the trailing "+N".
    const nextByKey = new Map<string, BadgeStatus>();
    for (const b of badges) {
      if (b.earned || b.badge.kind !== "progress") continue;
      const existing = nextByKey.get(b.badge.progressKey);
      if (!existing || existing.badge.kind !== "progress") {
        nextByKey.set(b.badge.progressKey, b);
        continue;
      }
      if (b.badge.target < existing.badge.target) {
        nextByKey.set(b.badge.progressKey, b);
      }
    }
    const nextInLadders = Array.from(nextByKey.values());

    // Preserve config order so the shelf is deterministic between
    // renders.
    const defOrder = new Map(badges.map((b, i) => [b.badge.id, i]));
    const byOrder = (a: BadgeStatus, b: BadgeStatus) =>
      (defOrder.get(a.badge.id) ?? 0) - (defOrder.get(b.badge.id) ?? 0);

    const shown: BadgeStatus[] = [
      ...earned,
      ...[...nextInLadders].sort(byOrder),
    ];

    const shownIds = new Set(shown.map((b) => b.badge.id));
    const remainingCount = badges.filter((b) => !shownIds.has(b.badge.id)).length;

    return {
      visible: shown,
      remainingCount,
      totalEarned: earned.length,
    };
  }, [badges]);

  return (
    <section className={styles.shelf} aria-labelledby="achievements-heading">
      <header className={styles.header}>
        <h3 id="achievements-heading" className={styles.heading}>ACHIEVEMENTS</h3>
        {badges.length > 0 && (
          <>
            <BrandDivider />
            {onSeeAll ? (
              <button
                type="button"
                className={styles.count}
                onClick={onSeeAll}
                aria-label={`${totalEarned} of ${badges.length} earned. See all achievements.`}
              >
                {totalEarned}<small>/{badges.length}</small>
              </button>
            ) : (
              <span className={styles.count} aria-label={`${totalEarned} of ${badges.length} earned`}>
                {totalEarned}<small>/{badges.length}</small>
              </span>
            )}
          </>
        )}
      </header>

      <HorizontalScroller
        ariaLabel="Achievements"
        className={styles.grid}
        edgeFade
      >
        {visible.map((b) => (
          <AchievementCard key={b.badge.id} badge={b} onPress={(x) => onTapBadge?.(x)} />
        ))}

        {remainingCount > 0 && onSeeAll && (
          <button
            type="button"
            className={`${styles.slot} ${styles["slot--more"]}`}
            onClick={onSeeAll}
            aria-label={`See all ${remainingCount} more achievements`}
          >
            <span className={styles.circle}>+{remainingCount}</span>
            <span className={styles.name}>More</span>
          </button>
        )}
      </HorizontalScroller>
    </section>
  );
}
