"use client";

import { useState } from "react";
import { FaBell, FaGear } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import type { PendingInvite } from "@/lib/data/crew-queries";
import { UserAvatar } from "@/components/ui";
import { RevealText } from "@/components/motion";
import { NotificationsSheet } from "@/components/Notifications/NotificationsSheet";
import { SettingsSheet } from "./SettingsSheet";
import styles from "./profileHeader.module.scss";

interface Props {
  user: Profile;
  isOwnProfile: boolean;
  /**
   * Meta-line shown under the name for another climber's profile —
   * e.g. "Yonder · #4 this set · 2 crews".
   */
  contextLine?: string | null;
  /**
   * Own-profile only: pending crew invites. Drives the badge dot on
   * the notification bell and hydrates the NotificationsSheet.
   */
  invites?: PendingInvite[];
  /** Own-profile only: surface the Admin link inside SettingsSheet. */
  isAdmin?: boolean;
}

/**
 * Identity + own-profile actions header. Two rows:
 *
 *   Row 1: avatar · @username
 *   Row 2:          display name · [bell] [gear]   (own profile)
 *                   display name                    (other climber)
 *
 * Consistent shape for own vs visited profiles — the action buttons
 * only render for the signed-in user's own profile. Settings opens a
 * bottom sheet with every account action (edit, gym switcher, push,
 * theme, privacy, sign out, delete, admin if applicable).
 */
export function ProfileHeader({
  user,
  isOwnProfile,
  contextLine,
  invites = [],
  isAdmin = false,
}: Props) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hasInvites = invites.length > 0;

  return (
    <>
      <header className={styles.header}>
        <UserAvatar user={user} size={72} className={styles.avatar} />

        <div className={styles.identity}>
          <RevealText text={`@${user.username}`} className={styles.username} />
          <div className={styles.metaRow}>
            {user.name && <p className={styles.displayName}>{user.name}</p>}
            {isOwnProfile && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setNotificationsOpen(true)}
                  aria-label={
                    hasInvites
                      ? `Notifications (${invites.length} pending)`
                      : "Notifications"
                  }
                >
                  <FaBell aria-hidden />
                  {hasInvites && (
                    <span className={styles.actionDot} aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Settings"
                >
                  <FaGear aria-hidden />
                </button>
              </div>
            )}
          </div>
          {!isOwnProfile && contextLine && (
            <p className={styles.contextLine}>{contextLine}</p>
          )}
        </div>
      </header>

      {isOwnProfile && (
        <>
          <NotificationsSheet
            invites={invites}
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
          />
          <SettingsSheet
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            isAdmin={isAdmin}
          />
        </>
      )}
    </>
  );
}
