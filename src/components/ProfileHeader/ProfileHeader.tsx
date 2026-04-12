"use client";

import { useState, useCallback, useEffect } from "react";
import {
  FaGear,
  FaKey,
  FaPen,
  FaRightFromBracket,
  FaTrash,
  FaShieldHalved,
  FaMountainSun,
  FaBell,
  FaBellSlash,
} from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { UserAvatar, showToast } from "@/components/ui";
import { RevealText } from "@/components/motion";
import { FollowButton } from "@/components/FollowButton/FollowButton";
import { FollowListSheet, type FollowListMode } from "@/components/FollowListSheet/FollowListSheet";
import { DropdownMenu } from "@/components/SettingsMenu/SettingsMenu";
import { EditProfileDialog } from "@/components/SettingsMenu/EditProfileDialog";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import { GymSwitcherSheet } from "@/components/GymSwitcher/GymSwitcherSheet";
import {
  pushSupported,
  readPushStatus,
  subscribeDevice,
  unsubscribeDevice,
  type PushStatus,
} from "@/lib/push/client";
import { savePushSubscription, removePushSubscription } from "@/app/(app)/actions";
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

  // Push subscription status — "default" / "granted" / "subscribed" /
  // "denied" / "unsupported". Read once on mount from the live SW
  // registration so the menu item label reflects reality.
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  useEffect(() => {
    if (!isOwnProfile) return;
    let cancelled = false;
    readPushStatus().then((s) => { if (!cancelled) setPushStatus(s); });
    return () => { cancelled = true; };
  }, [isOwnProfile]);

  const handleTogglePush = useCallback(async () => {
    if (pushStatus === "subscribed") {
      const { endpoint } = await unsubscribeDevice();
      if (endpoint) {
        const res = await removePushSubscription(endpoint);
        if ("error" in res) {
          showToast(res.error, "error");
          return;
        }
      }
      setPushStatus("granted");
      showToast("Notifications off", "info");
      return;
    }

    const result = await subscribeDevice();
    if ("error" in result) {
      showToast(result.error, "error");
      return;
    }
    const res = await savePushSubscription(result);
    if ("error" in res) {
      showToast(res.error, "error");
      return;
    }
    setPushStatus("subscribed");
    showToast("Notifications on", "success");
  }, [pushStatus]);

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
                    // Push toggle — hidden when the browser can't do web
                    // push (e.g. incognito / unsupported platforms) and
                    // when the user has explicitly denied permissions
                    // (the OS prompt won't re-ask, so a menu item that
                    // does nothing is worse than no item at all).
                    ...(pushSupported() && pushStatus !== null && pushStatus !== "unsupported" && pushStatus !== "denied"
                      ? [{
                          label: pushStatus === "subscribed" ? "Turn off notifications" : "Get notifications",
                          icon: pushStatus === "subscribed" ? <FaBellSlash /> : <FaBell />,
                          onSelect: handleTogglePush,
                        }]
                      : []),
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
