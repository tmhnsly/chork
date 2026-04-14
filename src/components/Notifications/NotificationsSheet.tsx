"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { PendingInvitesCard } from "@/components/Crew/PendingInvitesCard";
import type { PendingInvite } from "@/lib/data/crew-queries";
import styles from "./notificationsSheet.module.scss";

interface Props {
  invites: PendingInvite[];
  open: boolean;
  onClose: () => void;
}

/**
 * Notification sheet — opened from the profile header's bell button.
 *
 * Sections:
 *   • Crew invites — reuses the accept/decline card.
 *   • Beta likes — placeholder until the notifications pipeline
 *     exists; keeps the surface consistent.
 */
export function NotificationsSheet({ invites, open, onClose }: Props) {
  if (!open) return null;
  return (
    <BottomSheet
      open
      onClose={onClose}
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
  );
}
