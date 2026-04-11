"use client";

import { useState, useCallback } from "react";
import { FaGear, FaKey, FaPen, FaRightFromBracket, FaTrash, FaShieldHalved } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { UserAvatar } from "@/components/ui";
import { RevealText } from "@/components/motion";
import { FollowButton } from "@/components/FollowButton/FollowButton";
import { DropdownMenu } from "@/components/SettingsMenu/SettingsMenu";
import { EditProfileDialog } from "@/components/SettingsMenu/EditProfileDialog";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import styles from "./profileHeader.module.scss";

interface Props {
  user: Profile;
  isOwnProfile: boolean;
  isFollowing?: boolean;
  followerCount: number;
  followingCount: number;
}

export function ProfileHeader({ user, isOwnProfile, isFollowing, followerCount: initialFollowerCount, followingCount }: Props) {
  const { signOut, resetPassword } = useAuth();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  const handleFollowChange = useCallback((following: boolean, serverFollowerCount: number | null) => {
    if (serverFollowerCount !== null) {
      // Server confirmed — use as source of truth
      setFollowerCount(serverFollowerCount);
    } else {
      // Optimistic delta
      setFollowerCount((c) => Math.max(0, c + (following ? 1 : -1)));
    }
  }, []);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.identity}>
          <RevealText text={`@${user.username}`} className={styles.username} />
          {user.name && <p className={styles.displayName}>{user.name}</p>}
          <div className={styles.counts}>
            <span className={styles.count}>
              <strong>{followerCount}</strong> {followerCount === 1 ? "follower" : "followers"}
            </span>
            <span className={styles.dot}>&middot;</span>
            <span className={styles.count}>
              <strong>{followingCount}</strong> following
            </span>
          </div>
        </div>

        <div className={styles.rightGroup}>
          {!isOwnProfile && isFollowing !== undefined && (
            <FollowButton
              targetUserId={user.id}
              initialFollowing={isFollowing}
              onFollowChange={handleFollowChange}
            />
          )}
          <UserAvatar user={user} size={64} />
          {isOwnProfile && (
            <DropdownMenu
              trigger={
                <button className={styles.settingsTrigger} aria-label="Settings">
                  <FaGear />
                </button>
              }
              groups={[
                {
                  items: [
                    { label: "Edit profile", icon: <FaPen />, onSelect: () => setShowEditDialog(true) },
                    { label: "Reset password", icon: <FaKey />, onSelect: async () => {
                      const { createBrowserSupabase } = await import("@/lib/supabase/client");
                      const sb = createBrowserSupabase();
                      const { data: { user: authUser } } = await sb.auth.getUser();
                      if (authUser?.email) {
                        await resetPassword(authUser.email);
                      }
                    }},
                    { label: "Privacy policy", icon: <FaShieldHalved />, href: "/privacy" },
                  ],
                },
                {
                  items: [
                    { label: "Sign out", icon: <FaRightFromBracket />, variant: "warning", onSelect: signOut },
                    { label: "Delete account", icon: <FaTrash />, variant: "danger", onSelect: () => setShowDeleteDialog(true) },
                  ],
                },
              ]}
            />
          )}
        </div>
      </header>

      {isOwnProfile && (
        <>
          <EditProfileDialog user={user} open={showEditDialog} onOpenChange={setShowEditDialog} />
          <DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />
        </>
      )}
    </>
  );
}
