"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { UsersResponse } from "@/lib/pocketbase-types";
import { getAvatarUrl } from "@/lib/avatar";
import { useAuth } from "@/lib/auth-context";
import { Button, showToast } from "@/components/ui";
import { mutateAuthUser } from "@/lib/user-actions";
import styles from "./profileHeader.module.scss";

interface Props {
  user: UsersResponse;
  isOwnProfile: boolean;
}

export function ProfileHeader({ user, isOwnProfile }: Props) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Sync displayName when user prop changes (e.g. navigating between profiles)
  useEffect(() => {
    setDisplayName(user.name ?? "");
    setEditing(false);
    setAvatarPreview(null);
  }, [user.id, user.name]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const avatarSrc = avatarPreview ?? getAvatarUrl(user, { thumb: "200x200" });

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file (JPG, PNG, etc.)", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be under 5MB", "error");
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const result = await mutateAuthUser(formData);
      if ("error" in result) {
        showToast(result.error, "error");
        setAvatarPreview(null);
        return;
      }
      document.cookie = result.cookie;
      refreshUser();
      showToast("Photo updated");
      router.refresh();
    } catch (err) {
      console.warn("[chork] profile update failed:", err);
      showToast("Something went wrong", "error");
      setAvatarPreview(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSave() {
    if (displayName === (user.name ?? "")) {
      setEditing(false);
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", displayName);
      const result = await mutateAuthUser(formData);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      document.cookie = result.cookie;
      refreshUser();
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
    setAvatarPreview(null);
    setEditing(false);
  }

  return (
    <header className={styles.header}>
      {/* Avatar — always the same element, tappable in edit mode */}
      {editing ? (
        <>
          <button
            type="button"
            className={styles.avatarButton}
            onClick={() => fileRef.current?.click()}
            disabled={submitting}
          >
            <Image src={avatarSrc} alt={user.name || user.username} width={96} height={96} className={styles.avatarImg} unoptimized />
            <span className={styles.avatarOverlay}>Edit</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            hidden
          />
        </>
      ) : (
        <div className={styles.avatarWrap}>
          <Image src={avatarSrc} alt={user.name || user.username} width={96} height={96} className={styles.avatarImg} unoptimized />
        </div>
      )}

      {/* Identity / edit fields */}
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
