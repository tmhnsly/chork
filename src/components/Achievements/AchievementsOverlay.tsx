"use client";

import { useMemo, useRef, useState, useLayoutEffect, type Dispatch } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SheetBody, TabPills, type TabPillOption } from "@/components/ui";
import { AchievementCard } from "@/components/ui/AchievementCard/AchievementCard";
import type { BadgeStatus, BadgeCategory } from "@/lib/badges";
import { AchievementDetailBody } from "./AchievementDetailBody";
import { useSheetPresence } from "@/hooks/use-sheet-presence";
import type { OverlayState, OverlayAction } from "./achievementsOverlayReducer";
import styles from "./achievementsSheet.module.scss";

// Filters = the catalogue categories plus two meta filters:
//   "earned" shows only badges the climber has unlocked — the default,
//            since it's the most rewarding view and hopefully nudges a
//            new user toward tapping through to see them;
//   "all"    is the everything view, available but not default.
// Any new `BadgeCategory` value becomes a compile error here, keeping
// the pills in sync with the catalogue.
type Filter = "earned" | "all" | BadgeCategory;

// Ordered list of every filter pill. Every BadgeCategory in
// `src/lib/badges.ts` needs a row here — the memoiser below turns
// this into the visible tablist and leaves empty categories disabled
// rather than hidden so the row's column count stays stable.
const ALL_FILTERS: { id: Filter; label: string }[] = [
  { id: "earned", label: "Earned" },
  { id: "all", label: "All" },
  { id: "sends", label: "Sends" },
  { id: "flashes", label: "Flashes" },
  { id: "matches", label: "Matches" },
];

interface Props {
  badges: BadgeStatus[];
  state: OverlayState;
  dispatch: Dispatch<OverlayAction>;
}

/**
 * The achievements overlay — ONE BottomSheet that navigates between
 * the catalogue grid and a badge's detail, driven by
 * `achievementsOverlayReducer`.
 *
 * Its predecessor stacked a second modal dialog for the detail on top
 * of the catalogue's, and the pair fought over dismissal: interacting
 * with the top sheet could dismiss the one underneath, so closing the
 * detail dropped you back on the profile with the catalogue gone. One
 * dialog cannot fight itself — the detail swaps this sheet's content
 * and the chrome grows a back button (grid origin only; a detail
 * opened straight from the shelf has no grid behind it).
 *
 * The filter and the grid's scroll offset survive the push: the
 * filter is component state here (the overlay stays mounted), and the
 * reducer carries `gridScroll` captured at push time, restored by the
 * layout effect on the way back.
 */
export function AchievementsOverlay({ badges, state, dispatch }: Props) {
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
    // written ladder-ascending in `src/config/achievements.ts`, so
    // keeping the input order groups related badges together in the
    // climber's progression order.
    if (filter === "all") return badges;
    if (filter === "earned") return badges.filter((b) => b.earned);
    return badges.filter((b) => b.badge.category === filter);
  }, [badges, filter]);

  // The sheet's panel is the scroller (BottomSheet.scrollRef). Two
  // reasons to touch it: a filter change invalidates the position
  // (jump to top — the tab press is the event, handled in the change
  // handler below), and a view swap needs top-of-detail on push /
  // remembered offset on pop. The latter must run after the DOM has
  // swapped, hence the layout effect keyed on the view's name.
  const scrollRef = useRef<HTMLDivElement>(null);
  const view = state.view;
  const viewName = view.name;
  const savedScroll = state.gridScroll;
  useLayoutEffect(() => {
    if (viewName === "detail") {
      scrollRef.current?.scrollTo({ top: 0 });
    } else if (viewName === "grid") {
      scrollRef.current?.scrollTo({ top: savedScroll });
    }
  }, [viewName, savedScroll]);

  const changeFilter = (next: Filter) => {
    setFilter(next);
    // Jump, don't animate — a tab should feel immediate, and smooth
    // scrolling a long list makes the new content arrive late.
    scrollRef.current?.scrollTo({ top: 0 });
  };

  // Hold the last OPEN view: without this, closing from the badge
  // detail cleared the view and the body snapped back to the grid
  // for the length of the exit animation.
  const shown = useSheetPresence(view.name === "closed" ? null : view);
  const detail = shown?.name === "detail" ? shown : null;
  const hiddenDetail =
    detail !== null && detail.badge.badge.isSecret && !detail.badge.earned;

  return (
    <BottomSheet
      open={view.name !== "closed"}
      onClose={() => dispatch({ type: "close" })}
      title={
        detail
          ? hiddenDetail
            ? "Locked"
            : detail.badge.badge.name
          : "Achievements"
      }
      description={
        detail
          ? "Achievement detail"
          : "All achievements and your progress"
      }
      scrollRef={scrollRef}
      // One height for every view and every filter, so the sheet
      // stops resizing under the reader's thumb.
      minHeight="half"
      viewKey={detail ? `detail-${detail.badge.badge.id}` : "grid"}
      onBack={
        detail?.from === "grid"
          ? () => dispatch({ type: "back" })
          : undefined
      }
      subheader={
        detail ? undefined : (
          <TabPills
            options={filterOptions}
            value={filter}
            onChange={changeFilter}
            ariaLabel="Filter achievements"
            layout="wrap"
          />
        )
      }
    >
      {detail ? (
        <AchievementDetailBody badge={detail.badge} />
      ) : (
        <SheetBody>
          {/* A grid of cards, not a list of rows — the detail lives
              behind a tap; this is the glance. */}
          <ul className={styles.grid}>
            {visible.map((b) => (
              <li key={b.badge.id}>
                <AchievementCard
                  badge={b}
                  onPress={(badge) =>
                    dispatch({
                      type: "open-detail",
                      badge,
                      from: "grid",
                      gridScroll: scrollRef.current?.scrollTop ?? 0,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </SheetBody>
      )}
    </BottomSheet>
  );
}
