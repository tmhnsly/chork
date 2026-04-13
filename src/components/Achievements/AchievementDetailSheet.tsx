"use client";

import { FaCheck, FaLock } from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ICON_MAP, ProgressRing } from "@/components/BadgeShelf/BadgeShelf";
import type { BadgeStatus, BadgeCategory, BadgeIcon, ProgressKey } from "@/lib/badges";
import styles from "./achievementDetailSheet.module.scss";

interface Props {
  badge: BadgeStatus;
  open: boolean;
  onClose: () => void;
}

/**
 * Detail view for a single achievement, opened from the profile
 * BadgeShelf. Structure:
 *
 *   Large icon circle (matches the shelf's earned / locked styling)
 *   Achievement name (bold italic)
 *   Criteria copy
 *   Divider
 *   Progress section:
 *     • Earned  → earned-on date
 *     • Locked + quantifiable → single progress bar + "N / target
 *       <unit>" label
 *     • Locked + binary condition → empty-state line, no bar
 *
 * Dismissal is standard — tap backdrop or close button in the sheet
 * header (handled by BottomSheet itself).
 */
export function AchievementDetailSheet({ badge, open, onClose }: Props) {
  const hidden = badge.badge.isSecret && !badge.earned;
  const Icon = hidden ? FaLock : ICON_MAP[badge.badge.icon];
  const name = hidden ? "Secret achievement" : badge.badge.name;
  const description = hidden
    ? "Keep climbing to discover this one."
    : badge.badge.description;

  const isQuantifiable =
    !hidden && !badge.earned && badge.badge.kind === "progress" && badge.current !== null;
  const progressPct = isQuantifiable && badge.progress !== null
    ? Math.round(badge.progress * 100)
    : 0;

  // Circle / hero styling mirrors the shelf tile for the same badge.
  const heroState: "earned" | "progress" | "muted" = badge.earned
    ? "earned"
    : isQuantifiable
      ? "progress"
      : "muted";
  const family: "flash" | "success" | "accent" | null =
    heroState === "earned" ? earnedFamily(badge.badge) : null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={hidden ? "Locked" : badge.badge.name}
      description={description}
    >
      <div className={styles.sheet}>
        <div
          className={[
            styles.hero,
            styles[`hero--${heroState}`],
            family ? styles[`hero--${family}`] : "",
          ].filter(Boolean).join(" ")}
          aria-hidden
        >
          {heroState === "progress" && badge.progress !== null && (
            <ProgressRing progress={badge.progress} />
          )}
          <Icon />
        </div>

        <h2 className={styles.name}>{name}</h2>
        <p className={styles.criteria}>{description}</p>

        <div className={styles.divider} aria-hidden />

        {badge.earned ? (
          <div className={styles.earnedRow}>
            <span className={styles.tick} aria-hidden><FaCheck /></span>
            <span className={styles.earnedLabel}>
              {badge.earnedAt
                ? `Earned ${format(parseISO(badge.earnedAt), "MMM d, yyyy")}`
                : "Earned"}
            </span>
          </div>
        ) : isQuantifiable && badge.badge.kind === "progress" ? (
          <div className={styles.progress}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ "--progress": `${progressPct}%` } as React.CSSProperties}
              />
            </div>
            <span className={styles.progressLabel}>
              {badge.current} / {badge.badge.target}
              {" "}
              <span className={styles.progressUnit}>
                {progressUnit(badge.badge.progressKey, badge.badge.target)}
              </span>
            </span>
          </div>
        ) : (
          <p className={styles.empty}>
            {hidden
              ? "Keep climbing to unlock this one."
              : "Pull it off in a single set to earn this."}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

/** Match the shelf's badge → colour family mapping. */
function earnedFamily(badge: { category: BadgeCategory; icon: BadgeIcon }): "flash" | "success" | "accent" {
  if (badge.category === "flashes") return "flash";
  if (badge.icon === "flag") return "success";
  return "accent";
}

/** Human unit for the "N / target <unit>" progress label. Exhaustive
 *  over the `ProgressKey` union — extend both together. */
function progressUnit(key: ProgressKey, target: number): string {
  const plural = target !== 1;
  switch (key) {
    case "flashes": return plural ? "flashes" : "flash";
    case "sends":   return plural ? "sends" : "send";
    case "points":  return plural ? "points" : "point";
  }
}
