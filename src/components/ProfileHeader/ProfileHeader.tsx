"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FaGear, FaPen, FaRightFromBracket, FaTrash, FaShieldHalved } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { getAvatarUrl } from "@/lib/avatar";
import { useAuth } from "@/lib/auth-context";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { Button, InputError, showToast } from "@/components/ui";
import { DropdownMenu } from "@/components/SettingsMenu/SettingsMenu";
import { DeleteAccountDialog } from "@/components/SettingsMenu/DeleteAccountDialog";
import { updateProfile } from "@/lib/user-actions";
import styles from "./profileHeader.module.scss";

interface Props {
  user: Profile;
  isOwnProfile: boolean;
}

export function ProfileHeader({ user, isOwnProfile }: Props) {
  const router = useRouter();
  const { refreshProfile, signOut } = useAuth();
  const usernameValidation = useUsernameValidation(user.username);

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [username, setUsername] = useState(user.username);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    setDisplayName(user.name ?? "");
    setUsername(user.username);
    setEditing(false);
  }, [user.id, user.name, user.username]);

  const avatarSrc = getAvatarUrl(user, { size: 200 });

  async function handleSave() {
    if (username !== user.username) {
      const valid = await usernameValidation.validate(username, user.id);
      if (!valid) return;
    }

    const updates: { name?: string; username?: string } = {};
    if (displayName !== (user.name ?? "")) updates.name = displayName;
    if (username !== user.username) updates.username = username;

    if (Object.keys(updates).length === 0) {
      setEditing(false);
      return;
    }

    setSubmitting(true);
    try {
      const result = await updateProfile(updates);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      await refreshProfile();
      setEditing(false);
      showToast("Profile updated");
      if (updates.username) {
        router.replace(`/u/${updates.username}`);
      } else {
        router.refresh();
      }
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setDisplayName(user.name ?? "");
    setUsername(user.username);
    usernameValidation.setError("");
    setEditing(false);
  }

  if (editing) {
    return (
      <>
        <header className={styles.header}>
          <div className={styles.editFields}>
            <label className={styles.editLabel}>
              <span className={styles.fieldLabel}>Username</span>
              <div className={styles.usernameWrap}>
                <span className={styles.usernamePrefix}>@</span>
                <input
                  className={styles.input}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  onBlur={() => usernameValidation.validate(username, user.id)}
                />
              </div>
              <InputError message={usernameValidation.error} />
            </label>
            <label className={styles.editLabel}>
              <span className={styles.fieldLabel}>Display name</span>
              <input
                className={styles.input}
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <div className={styles.editActions}>
              <Button onClick={handleSave} disabled={submitting}>
                {submitting ? "Saving..." : "Save"}
              </Button>
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        </header>
        {isOwnProfile && (
          <DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />
        )}
      </>
    );
  }

  return (
    <>
      <header className={styles.header}>
        {/* Left: handle + display name */}
        <div className={styles.identity}>
          <h1 className={styles.username}>@{user.username}</h1>
          {user.name && <p className={styles.displayName}>{user.name}</p>}
        </div>

        {/* Right: avatar + settings */}
        <div className={styles.rightGroup}>
          <div className={styles.avatarWrap}>
            <Image
              src={avatarSrc}
              alt={user.name || user.username}
              width={64}
              height={64}
              className={styles.avatarImg}
              unoptimized
            />
          </div>
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
                    { label: "Edit profile", icon: <FaPen />, onSelect: () => setEditing(true) },
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
        <DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />
      )}
    </>
  );
}
