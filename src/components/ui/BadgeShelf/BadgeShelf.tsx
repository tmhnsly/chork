"use client";

import { FaMedal } from "react-icons/fa6";
import type { BadgeStatus } from "@/lib/badges";
import { SectionCard } from "@/components/ui/SectionCard";
import { AchievementCard } from "@/components/ui/AchievementCard/AchievementCard";
import { MoreAchievementsCard } from "@/components/ui/AchievementCard/MoreAchievementsCard";
import styles from "./badgeShelf.module.scss";

interface Props {
  /** The whole catalogue — the header counts it. */
  badges: BadgeStatus[];
  /**
   * The slots, already chosen — by `pickShelfBadges` on the server,
   * which is where the dates it ranks by are allowed to be. This
   * component only draws.
   */
  shelf: BadgeStatus[];
  /** Opens the full catalogue. Rendered as the last slot, always. */
  onSeeAll: () => void;
  onTapBadge?: (badge: BadgeStatus) => void;
}

/**
 * The profile's achievements: a fixed row of cards inside the same
 * SectionCard as every other section, and "View all" as the last one.
 *
 * It was a horizontally scrolling strip that bled to the viewport
 * edge. Inside a card that bleed punched straight through the card's
 * padding, and even bare on the page a scroller hides most of what it
 * holds. So: no scroller. Five slots, filled by RECENCY of activity —
 * recently earned, recently contributed towards — and the sixth is
 * always the way to the rest. See `pickShelfBadges` for the rule; it
 * runs on the server, so the dates it ranks by never reach the
 * browser (migration 132).
 *
 * The count in the header is earned / total, and tapping it opens the
 * catalogue too.
 */
export function BadgeShelf({ badges, shelf, onSeeAll, onTapBadge }: Props) {
  const totalEarned = badges.filter((b) => b.earned).length;
  const remaining = badges.length - shelf.length;

  return (
    <SectionCard
      title="Achievements"
      icon={<FaMedal />}
      meta={
        <button
          type="button"
          className={styles.count}
          onClick={onSeeAll}
          aria-label={`${totalEarned} of ${badges.length} earned. See all achievements.`}
        >
          {totalEarned}<small>/{badges.length}</small>
        </button>
      }
    >
      <ul className={styles.row} aria-label="Recent achievements">
        {shelf.map((b) => (
          <li key={b.badge.id}>
            <AchievementCard badge={b} onPress={(x) => onTapBadge?.(x)} />
          </li>
        ))}
        <li>
          <MoreAchievementsCard count={remaining} onPress={onSeeAll} />
        </li>
      </ul>
    </SectionCard>
  );
}
