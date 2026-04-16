"use client";

import { useMemo, useState } from "react";
import { FaLock } from "react-icons/fa6";
import type { BadgeStatus, BadgeCategory, BadgeIcon } from "@/lib/badges";
import { ICON_MAP } from "@/lib/badge-icons";
import { AchievementDetailSheet } from "@/components/Achievements/AchievementDetailSheet";
import { BrandDivider } from "@/components/ui/BrandDivider";
import styles from "./badgeShelf.module.scss";

// ICON_MAP re-exported so existing imports from BadgeShelf keep
// working. The map itself lives in src/lib/badge-icons.tsx so
// lightweight surfaces (toasts) can render icons without pulling
// in the shelf's full sheet/animation tree.
export { ICON_MAP };

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

  const openBadge = openBadgeId
    ? badges.find((b) => b.badge.id === openBadgeId) ?? null
    : null;

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

      <div className={styles.grid}>
        {visible.map((b) => {
          const isSecret = b.badge.isSecret && !b.earned;
          const Icon = isSecret ? FaLock : ICON_MAP[b.badge.icon];
          const name = isSecret ? "???" : b.badge.name;

          // Visual state:
          //   earned    — category tint, category border, category name
          //   progress  — category-coloured progress ring around the
          //                mono circle. Flash-category badges get the
          //                amber ring, zone-category (icon: flag) the
          //                teal ring, everything else the accent lime
          //   muted     — plain muted circle, muted name
          //                (one-off condition or secret)
          let state: "earned" | "progress" | "muted" = "muted";
          if (b.earned) state = "earned";
          else if (!isSecret && b.badge.kind === "progress") state = "progress";
          // Family drives both the earned tint and the in-progress
          // ring colour, so a climber sees the same colour signal
          // whether the badge is 60% earned or 100%.
          const family =
            state === "earned" || state === "progress"
              ? earnedFamily(b.badge)
              : null;
          const progress =
            state === "progress" && !b.earned && b.progress !== null
              ? b.progress
              : null;

          return (
            <button
              key={b.badge.id}
              type="button"
              className={`${styles.slot} ${styles[`slot--${state}`]} ${family ? styles[`slot--${family}`] : ""}`}
              onClick={() => setOpenBadgeId(b.badge.id)}
              aria-label={`${name}. ${isSecret ? "Secret achievement." : b.badge.description}`}
            >
              <span className={styles.circle}>
                {progress !== null && (
                  <ProgressRing
                    progress={progress}
                    family={family ?? "accent"}
                  />
                )}
                <Icon />
              </span>
              <span className={styles.name}>{name}</span>
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

/**
 * Progress ring overlay for in-progress achievement badges. Sits on
 * top of the circle, same pattern as ActivityRings — mono track,
 * accent fill, `stroke-dashoffset` drives the arc. Exported so the
 * detail sheet's hero can reuse the exact geometry.
 *
 * Uses `pathLength={1}` so the dashoffset range is a simple 0-1
 * regardless of radius — same trick ActivityRings uses.
 */
export function ProgressRing({
  progress,
  family = "accent",
}: {
  progress: number;
  /** Colour family for the filled arc. Matches the earned-state
   *  tint so a flash-category badge reads amber at 50% AND 100%. */
  family?: "accent" | "flash" | "success";
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  const strokeVar = `var(--${family === "accent" ? "accent" : family}-solid)`;
  return (
    <svg
      className={styles.progressRing}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle
        cx={50}
        cy={50}
        r={46}
        fill="none"
        stroke="var(--mono-border)"
        strokeWidth={6}
      />
      <circle
        cx={50}
        cy={50}
        r={46}
        fill="none"
        stroke={strokeVar}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - clamped}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}
