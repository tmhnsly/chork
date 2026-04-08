"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/data";
import { getAvatarUrl } from "@/lib/avatar";
import { useAuth } from "@/lib/auth-context";
import { Button, showToast } from "@/components/ui";
import { updateProfile } from "@/lib/user-actions";
import styles from "./profileHeader.module.scss";

interface Props {
  user: Profile;
  isOwnProfile: boolean;
}

export function ProfileHeader({ user, isOwnProfile }: Props) {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync when user prop changes (navigating between profiles)
  useEffect(() => {
    setDisplayName(user.name ?? "");
    setEditing(false);
  }, [user.id, user.name]);

  const avatarSrc = getAvatarUrl(user, { size: 200 });

  async function handleSave() {
    if (displayName === (user.name ?? "")) {
      setEditing(false);
      return;
    }
    setSubmitting(true);
    try {
      const result = await updateProfile({ name: displayName });
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      await refreshProfile();
      setEditing(false);
      showToast("Profile updated");
      router.refresh();
    } catch (err) {
      console.warn("[chork] profile update failed:", err);
      showToast("Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setDisplayName(user.name ?? "");
    setEditing(false);
  }

  return (
    <header className={styles.header}>
      <div className={styles.avatarWrap}>
        <Image
          src={avatarSrc}
          alt={user.name || user.username}
          width={96}
          height={96}
          className={styles.avatarImg}
          unoptimized
        />
      </div>

      {editing ? (
        <div className={styles.editFields}>
          <label className={styles.editLabel}>
            <span className={styles.fieldLabel}>Display name</span>
            <input
              className={styles.input}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <p className={styles.username}>@{user.username}</p>
          <div className={styles.editActions}>
            <Button onClick={handleSave} disabled={submitting}>
              Save
            </Button>
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.identity}>
          <h1 className={styles.name}>{user.name || user.username}</h1>
          <p className={styles.username}>@{user.username}</p>
          {isOwnProfile && (
            <Button variant="ghost" onClick={() => setEditing(true)} className={styles.editBtn}>
              Edit profile
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
