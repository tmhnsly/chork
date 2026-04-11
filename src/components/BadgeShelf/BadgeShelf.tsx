"use client";

import {
  FaBolt,
  FaFire,
  FaMountainSun,
  FaTrophy,
  FaStar,
  FaBroom,
} from "react-icons/fa6";
import type { BadgeStatus, BadgeTier, BadgeIcon } from "@/lib/badges";
import styles from "./badgeShelf.module.scss";

// Map serialisable icon IDs → actual React icon components
const ICON_MAP: Record<BadgeIcon, React.ComponentType> = {
  bolt: FaBolt,
  fire: FaFire,
  mountain: FaMountainSun,
  trophy: FaTrophy,
  star: FaStar,
  broom: FaBroom,
};

interface Props {
  badges: BadgeStatus[];
}

function tierClass(tier: BadgeTier): string {
  return styles[`tier--${tier}`] ?? "";
}

export function BadgeShelf({ badges }: Props) {
  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned);

  return (
    <section className={styles.shelf}>
      <h3 className={styles.title}>Achievements</h3>
      <div className={styles.grid}>
        {earned.map((b) => {
          const Icon = ICON_MAP[b.badge.icon];
          return (
            <div
              key={b.badge.id}
              className={`${styles.badge} ${tierClass(b.badge.tier)}`}
              title={`${b.badge.name} - ${b.badge.description}`}
            >
              <span className={styles.badgeIcon}>
                <Icon />
              </span>
              <span className={styles.badgeName}>{b.badge.name}</span>
            </div>
          );
        })}

        {locked.map((b) => {
          const Icon = ICON_MAP[b.badge.icon];
          return (
            <div
              key={b.badge.id}
              className={`${styles.badge} ${styles.badgeLocked}`}
              title={b.badge.description}
            >
              <span className={styles.badgeIcon}>
                <Icon />
              </span>
              <span className={styles.badgeName}>{b.badge.name}</span>
              {!b.earned && b.progress !== null && b.current !== null && b.badge.target !== null && (
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${Math.round(b.progress * 100)}%` }}
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
