"use client";

import { useState, useMemo } from "react";
import { FaCheck, FaLock } from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ICON_MAP } from "@/components/BadgeShelf/BadgeShelf";
import { AchievementDetailSheet } from "./AchievementDetailSheet";
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
  const [openBadgeId, setOpenBadgeId] = useState<string | null>(null);

  // Only show category pills that actually have badges so we never display
  // empty filters (Streaks/Social/Secret are reserved for future work).
  const filters = useMemo(() => {
    const present = new Set(badges.map((b) => b.badge.category));
    return ALL_FILTERS.filter((f) => f.id === "all" || present.has(f.id));
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

  const openBadge = openBadgeId ? badges.find((b) => b.badge.id === openBadgeId) ?? null : null;

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Achievements" description="All achievements and your progress">
        <div className={styles.body}>
          <h2 className={styles.heading}>Achievements</h2>

          <div className={styles.pills} role="tablist" aria-label="Filter achievements">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`${styles.pill} ${filter === f.id ? styles.pillActive : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ul className={styles.list}>
            {visible.map((b) => {
              const hidden = b.badge.isSecret && !b.earned;
              const Icon = hidden ? FaLock : ICON_MAP[b.badge.icon];
              const name = hidden ? "???" : b.badge.name;
              const description = hidden
                ? "Keep climbing to discover this one."
                : b.badge.description;

              return (
                <li key={b.badge.id}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => setOpenBadgeId(b.badge.id)}
                    aria-label={`${name}. ${description}`}
                  >
                    <span className={`${styles.rowIcon} ${b.earned ? styles.rowIconEarned : ""}`}>
                      <Icon />
                    </span>
                    <span className={styles.rowText}>
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
                      {b.earned && b.earnedAt && (
                        <span className={styles.earnedDate}>
                          Earned {format(parseISO(b.earnedAt), "MMM d, yyyy")}
                        </span>
                      )}
                    </span>
                    {b.earned && (
                      <span className={styles.tick} aria-label="Earned">
                        <FaCheck />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </BottomSheet>

      {openBadge && (
        <AchievementDetailSheet
          badge={openBadge}
          open={!!openBadge}
          onClose={() => setOpenBadgeId(null)}
        />
      )}
    </>
  );
}
