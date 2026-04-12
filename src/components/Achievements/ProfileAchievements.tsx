"use client";

import { useState } from "react";
import { BadgeShelf } from "@/components/BadgeShelf/BadgeShelf";
import { AchievementsSheet } from "./AchievementsSheet";
import type { BadgeStatus } from "@/lib/badges";

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
