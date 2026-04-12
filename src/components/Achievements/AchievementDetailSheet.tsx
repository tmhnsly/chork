"use client";

import { FaLock } from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ICON_MAP } from "@/components/BadgeShelf/BadgeShelf";
import type { BadgeStatus } from "@/lib/badges";
import styles from "./achievementDetailSheet.module.scss";

interface Props {
  badge: BadgeStatus;
  open: boolean;
  onClose: () => void;
}

export function AchievementDetailSheet({ badge, open, onClose }: Props) {
  const hidden = badge.badge.isSecret && !badge.earned;
  const Icon = hidden ? FaLock : ICON_MAP[badge.badge.icon];
  const name = hidden ? "???" : badge.badge.name;
  const description = hidden
    ? "This is a secret achievement. Keep climbing to unlock it."
    : badge.badge.description;

  return (
    <BottomSheet open={open} onClose={onClose} title={name} description={description}>
      <div className={styles.body}>
        <div className={`${styles.iconWrap} ${badge.earned ? styles.iconWrapEarned : ""}`}>
          <Icon />
        </div>

        <h2 className={styles.name}>{name}</h2>
        <p className={styles.description}>{description}</p>

        {badge.earned && badge.earnedAt && (
          <p className={styles.earned}>
            Earned {format(parseISO(badge.earnedAt), "MMM d, yyyy")}
          </p>
        )}

        {!hidden && !badge.earned && badge.progress !== null && badge.current !== null && badge.badge.target !== null && (
          <div className={styles.progressBlock}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ "--progress": `${Math.round(badge.progress * 100)}%` } as React.CSSProperties}
              />
            </div>
            <span className={styles.progressText}>
              {badge.current} / {badge.badge.target}
            </span>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
