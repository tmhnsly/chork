"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { UsersResponse } from "@/lib/pocketbase-types";
import { getAvatarUrl } from "@/lib/avatar";
import { Button, showToast } from "@/components/ui";
import { updateProfile } from "@/app/profile/actions";
import styles from "./profileHeader.module.scss";

interface Props {
  user: UsersResponse;
  isOwnProfile: boolean;
}

export function ProfileHeader({ user, isOwnProfile }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const avatarSrc = avatarPreview ?? getAvatarUrl(user, { thumb: "200x200" });

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarPreview(URL.createObjectURL(file));
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const result = await updateProfile(formData);
      if (result.error) {
        showToast(result.error, "error");
        setAvatarPreview(null);
        return;
      }
      if (result.cookie) document.cookie = result.cookie;
      showToast("Photo updated");
      router.refresh();
    } catch {
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
      const result = await updateProfile(formData);
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      if (result.cookie) document.cookie = result.cookie;
      setEditing(false);
      showToast("Profile updated");
      router.refresh();
    } catch {
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

  if (editing) {
    return (
      <header className={styles.header}>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => fileRef.current?.click()}
          disabled={submitting}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarSrc} alt="" className={styles.avatar} />
          <span className={styles.avatarOverlay}>Edit</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          hidden
        />

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
      </header>
    );
  }

  return (
    <header className={styles.header}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarSrc} alt="" className={styles.avatar} />
      <div className={styles.identity}>
        <h1 className={styles.name}>{user.name || user.username}</h1>
        <p className={styles.username}>@{user.username}</p>
        {isOwnProfile && (
          <Button variant="ghost" onClick={() => setEditing(true)} className={styles.editBtn}>
            Edit profile
          </Button>
        )}
      </div>
    </header>
  );
}
