"use client";

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
  FaChevronRight,
  FaLock,
} from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import type { BadgeStatus, BadgeIcon } from "@/lib/badges";
import styles from "./badgeShelf.module.scss";

// Map serialisable icon IDs → actual React icon components
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
};

interface Props {
  badges: BadgeStatus[];
  onSeeAll?: () => void;
}

export function BadgeShelf({ badges, onSeeAll }: Props) {
  const earned = badges
    .filter((b) => b.earned)
    .sort((a, b) => {
      const aDate = a.earned && a.earnedAt ? a.earnedAt : "";
      const bDate = b.earned && b.earnedAt ? b.earnedAt : "";
      return bDate.localeCompare(aDate);
    });
  const locked = badges.filter((b) => !b.earned);

  return (
    <section className={styles.shelf}>
      <header className={styles.header}>
        <h3 className={styles.title}>Achievements</h3>
        <div className={styles.headerRight}>
          {badges.length > 0 && (
            <span className={styles.count}>
              {earned.length} of {badges.length} earned
            </span>
          )}
          {onSeeAll && (
            <button
              type="button"
              className={styles.seeAll}
              onClick={onSeeAll}
              aria-label="See all achievements"
            >
              See all <FaChevronRight aria-hidden />
            </button>
          )}
        </div>
      </header>
      <div className={styles.grid}>
        {earned.map((b) => {
          const Icon = ICON_MAP[b.badge.icon];
          return (
            <div
              key={b.badge.id}
              className={`${styles.badge} ${styles.badgeEarned}`}
              title={`${b.badge.name} - ${b.badge.description}`}
            >
              <span className={styles.badgeIcon}>
                <Icon />
              </span>
              <span className={styles.badgeName}>{b.badge.name}</span>
              {b.earned && b.earnedAt && (
                <span className={styles.earnedDate}>
                  {format(parseISO(b.earnedAt), "MMM d")}
                </span>
              )}
            </div>
          );
        })}

        {locked.map((b) => {
          const Icon = ICON_MAP[b.badge.icon];
          const isSecret = b.badge.isSecret;
          return (
            <div
              key={b.badge.id}
              className={`${styles.badge} ${styles.badgeLocked}`}
              title={isSecret ? "Secret achievement" : b.badge.description}
            >
              <span className={styles.badgeIcon}>
                {isSecret ? <FaLock /> : <Icon />}
              </span>
              <span className={styles.badgeName}>
                {isSecret ? "???" : b.badge.name}
              </span>
              {!isSecret && !b.earned && b.progress !== null && b.current !== null && b.badge.target !== null && (
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ "--progress": `${Math.round(b.progress * 100)}%` } as React.CSSProperties}
                  />
                  <span className={styles.progressText}>
                    {b.current}/{b.badge.target}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
