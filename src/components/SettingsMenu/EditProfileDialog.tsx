"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FaCamera } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { updateProfile, uploadAvatar } from "@/lib/user-actions";
import { resizeAvatar } from "@/lib/image";
import { AppDialog, Button, InputError, UserAvatar, showToast } from "@/components/ui";
import styles from "./editProfileDialog.module.scss";

interface Props {
  user: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ user, open, onOpenChange }: Props) {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const usernameValidation = useUsernameValidation(user.username);
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername(user.username);
      setDisplayName(user.name ?? "");
      usernameValidation.setError("");
    }
  }, [open, user.username, user.name]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image", "error");
      return;
    }

    setUploading(true);
    try {
      // Resize to 256x256 JPEG client-side (~30-50KB)
      const resized = await resizeAvatar(file);
      const formData = new FormData();
      formData.set("avatar", resized);
      const result = await uploadAvatar(formData);
      if ("error" in result) {
        showToast(result.error, "error");
        return;
      }
      await refreshProfile();
      showToast("Photo updated");
      router.refresh();
    } catch {
      showToast("Something went wrong", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (username !== user.username) {
      const valid = await usernameValidation.validate(username, user.id);
      if (!valid) return;
    }

    const updates: { name?: string; username?: string } = {};
    if (displayName !== (user.name ?? "")) updates.name = displayName;
    if (username !== user.username) updates.username = username;

    if (Object.keys(updates).length === 0) {
      onOpenChange(false);
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
      onOpenChange(false);
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

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Edit profile">
      <h2 className={styles.heading}>Edit profile</h2>

      {/* Avatar picker */}
      <div className={styles.avatarSection}>
        <button
          type="button"
          className={`${styles.avatarBtn} ${uploading ? styles.avatarUploading : ""}`}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={uploading ? "Uploading photo" : "Change profile photo"}
        >
          <UserAvatar user={user} size={72} />
          <span className={styles.avatarOverlay}>
            {uploading ? <span className={styles.spinner} /> : <FaCamera />}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          hidden
        />
        <span className={styles.avatarHint}>
          {uploading ? "Uploading..." : "Tap to change photo"}
        </span>
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
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

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Display name</span>
          <input
            className={styles.input}
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </label>
      </div>

      <div className={styles.actions}>
        <Button onClick={handleSave} disabled={submitting || uploading} fullWidth>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)} fullWidth>
          Cancel
        </Button>
      </div>
    </AppDialog>
  );
}
