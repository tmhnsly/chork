"use client";

import { useState } from "react";
import { FaBell } from "react-icons/fa6";
import { NotificationsSheet } from "./NotificationsSheet";
import type { PendingInvite } from "@/lib/data/crew-queries";
import styles from "./notificationsButton.module.scss";

interface Props {
  invites: PendingInvite[];
}

/**
 * Notifications entry-point for the climber — a pill button with a
 * bell icon and unread-count badge that opens a sheet listing every
 * notification grouped by type:
 *
 *   • Crew invites — reuses the existing accept/decline card.
 *   • Beta likes — placeholder until the like-notification pipeline
 *     is wired up (a future notifications table keyed to the current
 *     user). Leaving the section rendered so the surface reads as a
 *     single inbox instead of "just crew invites" today.
 *
 * Positioned left of the Settings button on the profile so the nearby
 * chrome reads as personal-controls-for-you without mixing actions
 * into the gear menu.
 */
export function NotificationsButton({ invites }: Props) {
  const [open, setOpen] = useState(false);
  const count = invites.length;
  const label = count > 0
    ? `${count} notification${count === 1 ? "" : "s"}`
    : "Notifications";

  return (
    <>
      <button
        type="button"
        className={[
          styles.trigger,
          count > 0 ? styles.triggerUnread : "",
        ].filter(Boolean).join(" ")}
        onClick={() => setOpen(true)}
        aria-label={
          count > 0
            ? `${count} unread notification${count === 1 ? "" : "s"}`
            : "Notifications"
        }
      >
        <FaBell
          aria-hidden
          className={[
            styles.icon,
            count > 0 ? styles.iconRinging : "",
          ].filter(Boolean).join(" ")}
        />
        <span>{label}</span>
      </button>

      <NotificationsSheet
        invites={invites}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
