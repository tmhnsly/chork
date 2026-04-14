"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { BadgeShelf } from "@/components/BadgeShelf/BadgeShelf";
import type { BadgeStatus } from "@/lib/badges";

// Lazy — sheet only opens when the user taps "See all".
const AchievementsSheet = dynamic(
  () => import("./AchievementsSheet").then((m) => m.AchievementsSheet),
  { ssr: false },
);

interface Props {
  badges: BadgeStatus[];
}

/**
 * Client wrapper around `BadgeShelf` that manages the "See all" sheet state.
 * Kept minimal so the server page can remain an RSC.
 */
export function ProfileAchievements({ badges }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <BadgeShelf badges={badges} onSeeAll={() => setOpen(true)} />
      <AchievementsSheet
        badges={badges}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
