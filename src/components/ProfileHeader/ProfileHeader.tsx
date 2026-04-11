"use client";

import { useState } from "react";
import { FaGear, FaPen, FaRightFromBracket, FaTrash, FaShieldHalved } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { UserAvatar } from "@/components/ui";
import { DropdownMenu } from "@/components/SettingsMenu/SettingsMenu";
import { EditProfileDialog } from "@/components/SettingsMenu/EditProfileDialog";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import styles from "./profileHeader.module.scss";

interface Props {
  user: Profile;
  isOwnProfile: boolean;
}

export function ProfileHeader({ user, isOwnProfile }: Props) {
  const { signOut } = useAuth();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.identity}>
          <h1 className={styles.username}>@{user.username}</h1>
          {user.name && <p className={styles.displayName}>{user.name}</p>}
        </div>

        <div className={styles.rightGroup}>
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
