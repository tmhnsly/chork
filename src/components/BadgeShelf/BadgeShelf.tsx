"use client";

import type { BadgeStatus, BadgeTier } from "@/lib/badges";
import { TIER_COLOURS } from "@/lib/badges";
import styles from "./badgeShelf.module.scss";

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
      <h3 className={styles.title}>Badges</h3>
      <div className={styles.grid}>
        {earned.map((b) => {
          const Icon = b.badge.icon;
          const colours = TIER_COLOURS[b.badge.tier];
          return (
            <div
              key={b.badge.id}
              className={`${styles.badge} ${styles.badgeEarned} ${tierClass(b.badge.tier)}`}
              title={`${b.badge.name} — ${b.badge.description}`}
            >
              <span className={styles.badgeIcon} style={{ color: colours.solid }}>
                <Icon />
              </span>
              <span className={styles.badgeName}>{b.badge.name}</span>
            </div>
          );
        })}

        {locked.map((b) => {
          const Icon = b.badge.icon;
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
              {b.progress !== null && b.current !== null && b.badge.target !== null && (
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
