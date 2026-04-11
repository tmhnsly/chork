"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { updateProfile } from "@/lib/user-actions";
import { AppDialog, Button, InputError, showToast } from "@/components/ui";
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

  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername(user.username);
      setDisplayName(user.name ?? "");
      usernameValidation.setError("");
    }
  }, [open, user.username, user.name]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <Button onClick={handleSave} disabled={submitting} fullWidth>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)} fullWidth>
          Cancel
        </Button>
      </div>
    </AppDialog>
  );
}
