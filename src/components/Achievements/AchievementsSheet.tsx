"use client";

import { useMemo, useState } from "react";
import { FaCheck, FaLock } from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { TabPills, type TabPillOption } from "@/components/ui";
import { ICON_MAP } from "@/components/BadgeShelf/BadgeShelf";
import type { BadgeStatus, BadgeCategory } from "@/lib/badges";
import styles from "./achievementsSheet.module.scss";

interface Props {
  badges: BadgeStatus[];
  open: boolean;
  onClose: () => void;
}

type Filter = "all" | BadgeCategory;

const ALL_FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sends", label: "Sends" },
  { id: "flashes", label: "Flashes" },
  { id: "streaks", label: "Streaks" },
  { id: "social", label: "Social" },
  { id: "secret", label: "Secret" },
];

export function AchievementsSheet({ badges, open, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  // Every filter pill is always shown; empty categories render as
  // disabled so the choices stay predictable across sessions.
  const filterOptions = useMemo<TabPillOption<Filter>[]>(() => {
    const countByCategory = new Map<BadgeCategory, number>();
    for (const b of badges) {
      countByCategory.set(b.badge.category, (countByCategory.get(b.badge.category) ?? 0) + 1);
    }
    return ALL_FILTERS.map((f) => {
      if (f.id === "all") return { value: f.id, label: f.label, count: badges.length };
      const count = countByCategory.get(f.id) ?? 0;
      return { value: f.id, label: f.label, count, disabled: count === 0 };
    });
  }, [badges]);

  const visible = useMemo(() => {
    const filtered = filter === "all"
      ? badges
      : badges.filter((b) => b.badge.category === filter);
    return [...filtered].sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      return a.badge.name.localeCompare(b.badge.name);
    });
  }, [badges, filter]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Achievements"
      description="All achievements and your progress"
    >
      <div className={styles.body}>
        <TabPills
          options={filterOptions}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter achievements"
        />

        {/* Rows are informational only — no detail sheet. Earned
            date + tick on the right, name / description / progress
            inline on the left. */}
        <ul className={styles.list}>
          {visible.map((b) => {
            const hidden = b.badge.isSecret && !b.earned;
            const Icon = hidden ? FaLock : ICON_MAP[b.badge.icon];
            const name = hidden ? "???" : b.badge.name;
            const description = hidden
              ? "Keep climbing to discover this one."
              : b.badge.description;

            return (
              <li key={b.badge.id} className={styles.row}>
                <span className={`${styles.rowIcon} ${b.earned ? styles.rowIconEarned : ""}`}>
                  <Icon />
                </span>

                <div className={styles.rowText}>
                  <span className={styles.rowName}>{name}</span>
                  <span className={styles.rowDesc}>{description}</span>
                  {!hidden && !b.earned && b.progress !== null && b.current !== null && b.badge.target !== null && (
                    <span className={styles.progress}>
                      <span className={styles.progressBar}>
                        <span
                          className={styles.progressFill}
                          style={{ "--progress": `${Math.round(b.progress * 100)}%` } as React.CSSProperties}
                        />
                      </span>
                      <span className={styles.progressText}>
                        {b.current}/{b.badge.target}
                      </span>
                    </span>
                  )}
                </div>

                {b.earned && (
                  <div className={styles.rowRight}>
                    {b.earnedAt && (
                      <span className={styles.earnedDate}>
                        {format(parseISO(b.earnedAt), "MMM d, yyyy")}
                      </span>
                    )}
                    <span className={styles.tick} aria-label="Earned">
                      <FaCheck />
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}
