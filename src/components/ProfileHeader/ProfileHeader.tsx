"use client";

import type { Profile } from "@/lib/data";
import { UserAvatar } from "@/components/ui";
import { RevealText } from "@/components/motion";
import styles from "./profileHeader.module.scss";

interface Props {
  user: Profile;
  isOwnProfile: boolean;
  /**
   * Meta-line shown under the name for another climber's profile —
   * e.g. "Yonder · #4 this set · 2 crews".
   */
  contextLine?: string | null;
}

/**
 * Minimal identity header — username, display name, avatar and the
 * viewer-specific context line. Settings + Notifications moved into
 * the nav ProfileMenu so the header is pure read-only chrome now.
 */
export function ProfileHeader({
  user,
  isOwnProfile,
  contextLine,
}: Props) {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.identity}>
          <RevealText text={`@${user.username}`} className={styles.username} />
          {user.name && <p className={styles.displayName}>{user.name}</p>}
          {!isOwnProfile && contextLine && (
            <p className={styles.contextLine}>{contextLine}</p>
          )}
        </div>

        <div className={styles.rightGroup}>
          {/* Settings + Notifications now live in the nav's
              ProfileMenu dropdown — available from every screen
              instead of requiring a trip back to the profile page.
              The header keeps just identity + avatar. */}
          <UserAvatar user={user} size={64} />
        </div>
      </header>
    </>
  );
}
