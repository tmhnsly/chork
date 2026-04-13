"use client";

import { useMemo, useState } from "react";
import {
  FaBolt,
  FaFire,
  FaMountainSun,
  FaTrophy,
  FaStar,
  FaBroom,
  FaMoon,
  FaUsers,
  FaUserPlus,
  FaCrown,
  FaFrog,
  FaFlag,
  FaLock,
} from "react-icons/fa6";
import type { BadgeStatus, BadgeCategory, BadgeIcon } from "@/lib/badges";
import { AchievementDetailSheet } from "@/components/Achievements/AchievementDetailSheet";
import styles from "./badgeShelf.module.scss";

// Text-icon factory for the nursery-rhyme pair achievements.
// Renders the number pair (e.g. "1,2") as tight mono text in the
// badge's icon slot — more legible than cramming two glyphs in.
function makePairIcon(text: string): React.ComponentType {
  const Icon = () => <span className={styles.iconText}>{text}</span>;
  Icon.displayName = `PairIcon(${text})`;
  return Icon;
}

// Map serialisable icon IDs → actual React icon components.
// New icons go here AND into `BadgeIcon` in `src/lib/badges.ts`.
export const ICON_MAP: Record<BadgeIcon, React.ComponentType> = {
  bolt: FaBolt,
  fire: FaFire,
  mountain: FaMountainSun,
  trophy: FaTrophy,
  star: FaStar,
  broom: FaBroom,
  moon: FaMoon,
  "fire-streak": FaFire,
  users: FaUsers,
  "user-plus": FaUserPlus,
  crown: FaCrown,
  frog: FaFrog,
  flag: FaFlag,
  "num-1-2": makePairIcon("1,2"),
  "num-3-4": makePairIcon("3,4"),
  "num-5-6": makePairIcon("5,6"),
  "num-7-8": makePairIcon("7,8"),
  "num-9-10": makePairIcon("9,10"),
};

/**
 * Badge → colour family for the *earned* circle. Flash achievements
 * use the amber flash scale so they read visually like the Flash
 * badge on a PunchTile; zone achievements use the teal success scale
 * to match the zone badge; everything else uses the accent scale.
 *
 * In-progress slots render mono regardless of category so the shelf
 * doesn't falsely signal completion with a coloured (e.g. lime) ring.
 */
function earnedFamily(badge: { category: BadgeCategory; icon: BadgeIcon }): "flash" | "success" | "accent" {
  if (badge.category === "flashes") return "flash";
  if (badge.icon === "flag") return "success";
  return "accent";
}

interface Props {
  badges: BadgeStatus[];
  /** Called when the user taps the header count OR the "+N more"
   *  pill at the end of the shelf. Opens the full catalogue. */
  onSeeAll?: () => void;
}

export function BadgeShelf({ badges, onSeeAll }: Props) {
  const [openBadgeId, setOpenBadgeId] = useState<string | null>(null);

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

    // Next unearned tier per progress ladder.
    const nextByKey = new Map<string, BadgeStatus>();
    for (const b of badges) {
      if (b.earned || !b.badge.progressKey || b.badge.target === null) continue;
      const key = b.badge.progressKey;
      const existing = nextByKey.get(key);
      if (!existing || (b.badge.target ?? Infinity) < (existing.badge.target ?? Infinity)) {
        nextByKey.set(key, b);
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

  const openBadge = openBadgeId
    ? badges.find((b) => b.badge.id === openBadgeId) ?? null
    : null;

  return (
    <section className={styles.shelf} aria-labelledby="achievements-heading">
      <header className={styles.header}>
        <h3 id="achievements-heading" className={styles.heading}>ACHIEVEMENTS</h3>
        {badges.length > 0 && (
          onSeeAll ? (
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
          )
        )}
      </header>

      <div className={styles.grid}>
        {visible.map((b) => {
          const isSecret = b.badge.isSecret && !b.earned;
          const Icon = isSecret ? FaLock : ICON_MAP[b.badge.icon];
          const name = isSecret ? "???" : b.badge.name;

          // Visual state:
          //   earned    — lime tint, lime border, lime name
          //   progress  — category-toned circle with small dot below
          //                (quantifiable target, not yet earned)
          //   muted     — plain muted circle, muted name
          //                (one-off condition or secret)
          let state: "earned" | "progress" | "muted" = "muted";
          if (b.earned) state = "earned";
          else if (!isSecret && b.badge.progressKey && b.badge.target !== null) state = "progress";
          const family = state === "earned" ? earnedFamily(b.badge) : null;

          return (
            <button
              key={b.badge.id}
              type="button"
              className={`${styles.slot} ${styles[`slot--${state}`]} ${family ? styles[`slot--${family}`] : ""}`}
              onClick={() => setOpenBadgeId(b.badge.id)}
              aria-label={`${name}. ${isSecret ? "Secret achievement." : b.badge.description}`}
            >
              <span className={styles.circle}>
                <Icon />
              </span>
              <span className={styles.name}>{name}</span>
              {state === "progress" && (
                <span className={styles.progressDot} aria-hidden />
              )}
            </button>
          );
        })}

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
      </div>

      {openBadge && (
        <AchievementDetailSheet
          badge={openBadge}
          open
          onClose={() => setOpenBadgeId(null)}
        />
      )}
    </section>
  );
}
