"use client";

import { useState, useCallback } from "react";
import { FaGear, FaKey, FaPen, FaRightFromBracket, FaTrash, FaShieldHalved, FaMountainSun } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { UserAvatar } from "@/components/ui";
import { RevealText } from "@/components/motion";
import { FollowButton } from "@/components/FollowButton/FollowButton";
import { FollowListSheet, type FollowListMode } from "@/components/FollowListSheet/FollowListSheet";
import { DropdownMenu } from "@/components/SettingsMenu/SettingsMenu";
import { EditProfileDialog } from "@/components/SettingsMenu/EditProfileDialog";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import { GymSwitcherSheet } from "@/components/GymSwitcher/GymSwitcherSheet";
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
  const [showGymSwitcher, setShowGymSwitcher] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [followList, setFollowList] = useState<FollowListMode | null>(null);

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
            <CountPill
              count={followerCount}
              label={followerCount === 1 ? "follower" : "followers"}
              onOpen={() => setFollowList("followers")}
            />
            <span className={styles.dot}>&middot;</span>
            <CountPill
              count={followingCount}
              label="following"
              onOpen={() => setFollowList("following")}
            />
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
                    { label: "Change gym", icon: <FaMountainSun />, onSelect: () => setShowGymSwitcher(true) },
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
          <GymSwitcherSheet
            open={showGymSwitcher}
            onClose={() => setShowGymSwitcher(false)}
            activeGymId={user.active_gym_id ?? null}
          />
        </>
      )}

      {followList && (
        <FollowListSheet
          userId={user.id}
          mode={followList}
          onClose={() => setFollowList(null)}
        />
      )}
    </>
  );
}

interface CountPillProps {
  count: number;
  label: string;
  onOpen: () => void;
}

function CountPill({ count, label, onOpen }: CountPillProps) {
  // When count is 0, render as plain text — nothing to show in a sheet
  if (count === 0) {
    return (
      <span className={styles.count}>
        <strong>0</strong> {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={styles.countButton}
      onClick={onOpen}
      aria-label={`View ${label}`}
    >
      <strong>{count}</strong> {label}
    </button>
  );
}
