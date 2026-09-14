"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { FaGear } from "react-icons/fa6";
import { IconButton } from "@/components/ui";

// Lazy: it only ever opens on a tap, and every visited profile would
// otherwise pay for it.
const SettingsSheet = dynamic(
  () => import("@/components/ProfileHeader/SettingsSheet").then((m) => m.SettingsSheet),
  { ssr: false },
);

/**
 * The settings gear in the hero's corner — the same round IconButton
 * as the Match screen's menu, so chrome is one shape everywhere. It
 * used to share the social action row at the card's foot; settings
 * next to "your people" gave plumbing the same weight as friendship.
 */
export function SettingsCorner() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Settings" onClick={() => setOpen(true)}>
        <FaGear />
      </IconButton>
      {open && <SettingsSheet open onClose={() => setOpen(false)} />}
    </>
  );
}
