"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { BadgeShelf } from "@/components/ui/BadgeShelf/BadgeShelf";
import type { BadgeStatus } from "@/lib/badges";

// Lazy — sheets only open on user gesture.
const AchievementsSheet = dynamic(
  () => import("./AchievementsSheet").then((m) => m.AchievementsSheet),
  { ssr: false },
);
const AchievementDetailSheet = dynamic(
  () => import("./AchievementDetailSheet").then((m) => m.AchievementDetailSheet),
  { ssr: false },
);

interface Props {
  badges: BadgeStatus[];
  /** The shelf's slots, chosen server-side — see `pickShelfBadges`. */
  shelf: BadgeStatus[];
}

/**
 * Client wrapper around `BadgeShelf` that owns both the "See all" sheet
 * and the per-badge detail sheet. BadgeShelf reports taps; this layer
 * decides what to do — keeps BadgeShelf decoupled from the Achievements
 * feature folder. Server page can stay an RSC.
 *
 * One detail sheet, two ways in: a card on the shelf, or a card in the
 * catalogue. Both land here, so an achievement reads the same however
 * you reached it — and the catalogue is no longer a dead end that
 * showed a progress bar and answered no questions.
 *
 * The detail renders after the catalogue in DOM order, so when it
 * opens from a card inside the catalogue it stacks on top and closing
 * it returns you to the grid rather than to the profile.
 */
export function ProfileAchievements({ badges, shelf }: Props) {
  const [allOpen, setAllOpen] = useState(false);
  const [openBadge, setOpenBadge] = useState<BadgeStatus | null>(null);

  return (
    <>
      <BadgeShelf
        badges={badges}
        shelf={shelf}
        onSeeAll={() => setAllOpen(true)}
        onTapBadge={setOpenBadge}
      />
      <AchievementsSheet
        badges={badges}
        open={allOpen}
        onClose={() => setAllOpen(false)}
        onTapBadge={setOpenBadge}
      />
      {openBadge && (
        <AchievementDetailSheet
          badge={openBadge}
          open
          onClose={() => setOpenBadge(null)}
        />
      )}
    </>
  );
}
