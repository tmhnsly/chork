"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FaGear } from "react-icons/fa6";
import styles from "./profileActions.module.scss";

// Lazy: it only ever opens on a tap, and every visited profile would
// otherwise pay for it.
const SettingsSheet = dynamic(
  () => import("@/components/ProfileHeader/SettingsSheet").then((m) => m.SettingsSheet),
  { ssr: false },
);

/**
 * The settings gear in the hero's identity corner — chrome, sized as
 * chrome, where chrome belongs.
 *
 * Mount contract B (see BottomSheet): mounted on first open and kept,
 * with a real `open` prop — the sheet's own panel routing and
 * optimistic toggles survive a close/reopen, and the slide-out
 * animation gets to play. The first version conditionally mounted it
 * with `open` hardcoded true — contract A wearing B's prop.
 */
export function SettingsCorner() {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => {
          setHasOpened(true);
          setOpen(true);
        }}
        aria-label="Settings"
      >
        <FaGear aria-hidden />
      </button>
      {hasOpened && <SettingsSheet open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
