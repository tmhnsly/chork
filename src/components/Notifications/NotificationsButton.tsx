"use client";

import { useState } from "react";
import { FaBell } from "react-icons/fa6";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { PendingInvite } from "@/lib/data/crew-queries";
import { PendingInvitesCard } from "@/components/Crew/PendingInvitesCard";
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

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label={
          count > 0
            ? `Notifications (${count} unread)`
            : "Notifications"
        }
      >
        <FaBell aria-hidden />
        <span>Inbox</span>
        {count > 0 && (
          <span className={styles.badge} aria-hidden>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <BottomSheet
          open
          onClose={() => setOpen(false)}
          title="Notifications"
          description="Crew invites and activity on your climbs"
        >
          <div className={styles.sheet}>
            {invites.length > 0 ? (
              <PendingInvitesCard invites={invites} />
            ) : (
              <section className={styles.section} aria-label="Crew invites">
                <h2 className={styles.sectionHeading}>Crew invites</h2>
                <p className={styles.empty}>No pending invites.</p>
              </section>
            )}

            <section className={styles.section} aria-label="Beta activity">
              <h2 className={styles.sectionHeading}>Beta activity</h2>
              <p className={styles.empty}>
                We&apos;ll let you know when climbers like the beta you&apos;ve
                posted. Nothing yet — go send something spicy.
              </p>
            </section>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
