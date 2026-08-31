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
 * chrome, where chrome belongs. It used to share the social action row
 * at the card's foot; settings next to "your people" gave plumbing the
 * same weight as friendship.
 */
export function SettingsCorner() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => setOpen(true)}
        aria-label="Settings"
      >
        <FaGear aria-hidden />
      </button>
      {open && <SettingsSheet open onClose={() => setOpen(false)} />}
    </>
  );
}
