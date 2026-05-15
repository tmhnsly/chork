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
}

/**
 * Client wrapper around `BadgeShelf` that owns both the "See all" sheet
 * and the per-badge detail sheet. BadgeShelf reports taps; this layer
 * decides what to do — keeps BadgeShelf decoupled from the Achievements
 * feature folder. Server page can stay an RSC.
 */
export function ProfileAchievements({ badges }: Props) {
  const [allOpen, setAllOpen] = useState(false);
  const [openBadge, setOpenBadge] = useState<BadgeStatus | null>(null);

  return (
    <>
      <BadgeShelf
        badges={badges}
        onSeeAll={() => setAllOpen(true)}
        onTapBadge={setOpenBadge}
      />
      <AchievementsSheet
        badges={badges}
        open={allOpen}
        onClose={() => setAllOpen(false)}
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
