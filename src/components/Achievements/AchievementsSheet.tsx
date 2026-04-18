"use client";

import { useMemo, useState } from "react";
import { FaCheck, FaLock } from "react-icons/fa6";
import { format, parseISO } from "date-fns";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SheetBody, TabPills, type TabPillOption } from "@/components/ui";
import { ICON_MAP } from "@/components/BadgeShelf/BadgeShelf";
import type { BadgeStatus, BadgeCategory } from "@/lib/badges";
import { badgeFamily } from "@/lib/badges";
import styles from "./achievementsSheet.module.scss";

interface Props {
  badges: BadgeStatus[];
  open: boolean;
  onClose: () => void;
}

// Filters = the catalogue categories plus two meta filters:
//   "earned" shows only badges the climber has unlocked — the new
//            default, since it's the most rewarding view and hopefully
//            nudges a new user toward tapping through to see them;
//   "all"    is the everything view, available but no longer default.
// Any new `BadgeCategory` value becomes a compile error here, keeping
// the pills in sync with the catalogue.
type Filter = "earned" | "all" | BadgeCategory;

// Ordered list of every filter pill. Every BadgeCategory in
// `src/lib/badges.ts` needs a row here — the memoiser below
// turns this into the visible tablist and leaves empty categories
// disabled rather than hidden so the row's column count stays
// stable across sessions.
const ALL_FILTERS: { id: Filter; label: string }[] = [
  { id: "earned", label: "Earned" },
  { id: "all", label: "All" },
  { id: "sends", label: "Sends" },
  { id: "flashes", label: "Flashes" },
  { id: "jams", label: "Jams" },
];

export function AchievementsSheet({ badges, open, onClose }: Props) {
  const earnedCount = useMemo(
    () => badges.filter((b) => b.earned).length,
    [badges],
  );
  // Default to Earned when the climber has at least one badge; fall
  // back to All on a fresh account so they don't open an empty sheet.
  const [filter, setFilter] = useState<Filter>(
    earnedCount > 0 ? "earned" : "all",
  );

  // Every filter pill is always shown; empty categories render as
  // disabled so the choices stay predictable across sessions.
  const filterOptions = useMemo<TabPillOption<Filter>[]>(() => {
    const countByCategory = new Map<BadgeCategory, number>();
    for (const b of badges) {
      countByCategory.set(b.badge.category, (countByCategory.get(b.badge.category) ?? 0) + 1);
    }
    return ALL_FILTERS.map((f) => {
      if (f.id === "earned") {
        return {
          value: f.id,
          label: f.label,
          count: earnedCount,
          disabled: earnedCount === 0,
        };
      }
      if (f.id === "all") return { value: f.id, label: f.label, count: badges.length };
      const count = countByCategory.get(f.id) ?? 0;
      return { value: f.id, label: f.label, count, disabled: count === 0 };
    });
  }, [badges, earnedCount]);

  const visible = useMemo(() => {
    // Preserve the catalogue's authored order — achievements are
    // written ladder-ascending in `src/config/achievements.ts`
    // (flash 1 → 1000, rhyme pairs 1-2 → 9-10, etc.), so keeping the
    // input order automatically groups related badges together and
    // reads in the climber's progression order.
    if (filter === "all") return badges;
    if (filter === "earned") return badges.filter((b) => b.earned);
    return badges.filter((b) => b.badge.category === filter);
  }, [badges, filter]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Achievements"
      description="All achievements and your progress"
      subheader={
        <TabPills
          options={filterOptions}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter achievements"
          layout="wrap"
        />
      }
    >
      <SheetBody>
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
            // Earned rows carry a family class (accent / flash /
            // success) so the icon tint + tick background match the
            // badge's category — flashes read amber, zones teal, etc.
            // In-progress rows stay mono apart from the progress bar,
            // which uses the family colour as its fill. Locked / secret
            // rows have no family (neutral mono treatment).
            const family =
              b.earned || (!hidden && b.badge.kind === "progress")
                ? badgeFamily(b.badge)
                : null;
            const familyClass = family ? styles[`row--${family}`] : "";

            return (
              <li
                key={b.badge.id}
                className={`${styles.row} ${familyClass}`}
              >
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
      </SheetBody>
    </BottomSheet>
  );
}
