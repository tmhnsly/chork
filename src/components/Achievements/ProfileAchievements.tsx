"use client";

import { useReducer, useState } from "react";
import dynamic from "next/dynamic";
import { BadgeShelf } from "@/components/ui/BadgeShelf/BadgeShelf";
import type { BadgeStatus } from "@/lib/badges";
import {
  achievementsOverlayReducer,
  initialOverlayState,
} from "./achievementsOverlayReducer";

// Lazy — the overlay only opens on user gesture, and every visited
// profile would otherwise pay for it. Mounted on first open and kept
// mounted after, so the close animation plays and the filter state
// survives a reopen.
const AchievementsOverlay = dynamic(
  () => import("./AchievementsOverlay").then((m) => m.AchievementsOverlay),
  { ssr: false },
);

interface Props {
  badges: BadgeStatus[];
  /** The shelf's slots, chosen server-side — see `pickShelfBadges`. */
  shelf: BadgeStatus[];
}

/**
 * Client wrapper around `BadgeShelf` that owns the achievements
 * overlay. BadgeShelf reports taps; this layer decides what to do —
 * keeps BadgeShelf decoupled from the Achievements feature folder,
 * and the server page stays an RSC.
 *
 * One overlay, two ways in: a card on the shelf opens its detail
 * directly; "See all" opens the catalogue grid, and a card in the
 * grid pushes the detail with a back button. It is ONE BottomSheet
 * navigating internally (see `achievementsOverlayReducer`) — the old
 * arrangement stacked two sibling modal dialogs and closing the top
 * one could take the bottom one with it.
 */
export function ProfileAchievements({ badges, shelf }: Props) {
  const [state, dispatch] = useReducer(
    achievementsOverlayReducer,
    initialOverlayState,
  );
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <>
      <BadgeShelf
        badges={badges}
        shelf={shelf}
        onSeeAll={() => {
          setHasOpened(true);
          dispatch({ type: "open-grid" });
        }}
        onTapBadge={(badge) => {
          setHasOpened(true);
          dispatch({ type: "open-detail", badge, from: "shelf" });
        }}
      />
      {hasOpened && (
        <AchievementsOverlay badges={badges} state={state} dispatch={dispatch} />
      )}
    </>
  );
}
