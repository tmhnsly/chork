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
  FaUserGroup,
} from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import type { PendingInvite } from "@/lib/data/crew-queries";
import { NotificationsButton } from "@/components/Notifications/NotificationsButton";
import { useAuth } from "@/lib/auth-context";
import { UserAvatar, showToast } from "@/components/ui";
import { RevealText } from "@/components/motion";
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
import { setAllowCrewInvites } from "@/app/crew/actions";
import styles from "./profileHeader.module.scss";

interface Props {
  user: Profile;
  isOwnProfile: boolean;
  /**
   * Meta-line shown under the name for another climber's profile —
   * e.g. "Yonder · #4 this set · 2 crews". Replaces the old
   * follower/following count pills that the crew feature retired.
   * Omit when rendering your own profile.
   */
  contextLine?: string | null;
  /**
   * Pending crew invites addressed to the signed-in user. Drives the
   * Inbox button's unread badge and the crew-invite section inside
   * the notifications sheet. Only used when `isOwnProfile`.
   */
  pendingInvites?: PendingInvite[];
}

export function ProfileHeader({
  user,
  isOwnProfile,
  contextLine,
  pendingInvites = [],
}: Props) {
  const { signOut, resetPassword } = useAuth();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showGymSwitcher, setShowGymSwitcher] = useState(false);

  // Optimistic view of allow_crew_invites — keeps the menu label in
  // sync after the toggle without waiting for a full refresh.
  const [allowInvites, setAllowInvites] = useState<boolean>(user.allow_crew_invites);

  const handleToggleAllowInvites = useCallback(async () => {
    const next = !allowInvites;
    setAllowInvites(next);
    const res = await setAllowCrewInvites(next);
    if ("error" in res) {
      setAllowInvites(!next);
      showToast(res.error, "error");
      return;
    }
    showToast(next ? "Crew invites on" : "Crew invites off", "info");
  }, [allowInvites]);

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
          {isOwnProfile && (
            <NotificationsButton invites={pendingInvites} />
          )}
          {isOwnProfile && (
            <DropdownMenu
              trigger={
                <button className={styles.settingsTrigger} type="button">
                  <FaGear aria-hidden />
                  <span>Settings</span>
                </button>
              }
              groups={[
                {
                  items: [
                    { label: "Edit profile", icon: <FaPen />, onSelect: () => setShowEditDialog(true) },
                    { label: "Change gym", icon: <FaMountainSun />, onSelect: () => setShowGymSwitcher(true) },
                    {
                      label: allowInvites ? "Disable crew invites" : "Allow crew invites",
                      icon: <FaUserGroup />,
                      onSelect: handleToggleAllowInvites,
                    },
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
          <UserAvatar user={user} size={64} />
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
    </>
  );
}
