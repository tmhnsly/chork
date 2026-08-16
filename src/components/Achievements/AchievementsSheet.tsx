"use client";

import { useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SheetBody, TabPills, type TabPillOption } from "@/components/ui";
import { AchievementCard } from "@/components/ui/AchievementCard/AchievementCard";
import type { BadgeStatus, BadgeCategory } from "@/lib/badges";
import styles from "./achievementsSheet.module.scss";

interface Props {
  badges: BadgeStatus[];
  open: boolean;
  onClose: () => void;
  /**
   * Tapping a card asks for the detail sheet. Owned by the parent so
   * both entry points — this catalogue and the profile shelf — open
   * the same one, rather than this sheet growing a second copy.
   */
  onTapBadge: (badge: BadgeStatus) => void;
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
  { id: "matches", label: "Matches" },
];

export function AchievementsSheet({ badges, open, onClose, onTapBadge }: Props) {
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

  // Switching filter swaps the whole list underneath the pinned pill
  // row, but the sheet keeps its scroll offset. Scrolled halfway down
  // a long "All" list, picking a short category left the sheet parked
  // past the end of the new list — reading as empty until you scrolled
  // back up. Reset on change rather than in an effect: the tab press
  // is the event that invalidates the position.
  const scrollRef = useRef<HTMLDivElement>(null);
  const changeFilter = (next: Filter) => {
    setFilter(next);
    // Jump, don't animate — a tab should feel immediate, and smooth
    // scrolling a long list makes the new content arrive late.
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Achievements"
      description="All achievements and your progress"
      scrollRef={scrollRef}
      subheader={
        <TabPills
          options={filterOptions}
          value={filter}
          onChange={changeFilter}
          ariaLabel="Filter achievements"
          layout="wrap"
        />
      }
    >
      <SheetBody>
        {/* A grid of cards, not a list of rows. Full-width rows put
            the name, description, progress bar and earned date on one
            line each — too wide to scan, and a different thing to look
            at than the shelf they were opened from. The detail lives
            behind a tap now; this is the glance. */}
        <ul className={styles.grid}>
          {visible.map((b) => (
            <li key={b.badge.id}>
              <AchievementCard badge={b} onPress={onTapBadge} />
            </li>
          ))}
        </ul>
      </SheetBody>
    </BottomSheet>
  );
}
