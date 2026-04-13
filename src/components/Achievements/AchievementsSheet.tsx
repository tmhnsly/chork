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

// Filter values map 1:1 to `BadgeCategory` values (+ "all"). Adding a
// new category narrows to TS error here — keeps the pills in sync
// with the catalogue automatically.
type Filter = "all" | BadgeCategory;

const ALL_FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sends", label: "Sends" },
  { id: "flashes", label: "Flashes" },
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
    // Preserve the catalogue's authored order — achievements are
    // written ladder-ascending in `src/config/achievements.ts`
    // (flash 1 → 1000, rhyme pairs 1-2 → 9-10, etc.), so keeping the
    // input order automatically groups related badges together and
    // reads in the climber's progression order. A name-based sort
    // was scattering "Thunder Shock" to T and "Spark" to S, which
    // broke the ladder visually.
    return filter === "all"
      ? badges
      : badges.filter((b) => b.badge.category === filter);
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
                  {!hidden && !b.earned && b.badge.kind === "progress" && b.progress !== null && b.current !== null && (
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
