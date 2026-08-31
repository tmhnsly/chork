"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Friend } from "@/lib/data/friend-queries";
import { useSheetPresence } from "@/hooks/use-sheet-presence";
import styles from "./profileHero.module.scss";

// Lazy — the roster only matters once someone asks for it.
const FriendsSheet = dynamic(
  () => import("./FriendsSheet").then((m) => m.FriendsSheet),
  { ssr: false },
);

interface Props {
  friends: Friend[];
}

/**
 * Friends as a STAT, not a call to action.
 *
 * The profile used to carry a full-width "Find friends" button —
 * chrome given the weight of an achievement. How many people you
 * climb with is a number that belongs beside your sends; who they
 * are is one tap away in a drawer, and the drawer's footer is the
 * way to /friends for anything more.
 */
export function ProfileFriendsStat({ friends }: Props) {
  const [open, setOpen] = useState(false);
  const shown = useSheetPresence(open ? friends : null);

  return (
    <>
      <button
        type="button"
        className={`${styles.total} ${styles.totalButton}`}
        onClick={() => setOpen(true)}
        aria-label={`${friends.length} friends. Open the list.`}
      >
        <span className={styles.totalLabel}>Friends</span>
        <span className={styles.totalValue}>{friends.length}</span>
      </button>
      {shown && (
        <FriendsSheet
          open={open}
          friends={shown}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
