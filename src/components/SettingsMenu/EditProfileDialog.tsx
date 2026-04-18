"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FaCamera } from "react-icons/fa6";
import type { Profile } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { updateProfile, uploadAvatar } from "@/lib/user-actions";
import { resizeAvatar } from "@/lib/image";
import {
  AppDialog,
  Button,
  InputError,
  SheetActions,
  UserAvatar,
  showToast,
} from "@/components/ui";
import styles from "./editProfileDialog.module.scss";

interface Props {
  user: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Public wrapper. The body only mounts while `open` is true, so every
 * open is a fresh component with clean `useState(user.*)`
 * initialisers — no useEffect-on-open reset needed, and no chance of
 * the stale-closure bug the previous `eslint-disable
 * react-hooks/exhaustive-deps` was papering over. If the profile
 * changes while the dialog is closed, the next open reads the
 * latest props.
 */
export function EditProfileDialog({ user, open, onOpenChange }: Props) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Edit profile">
      {open && <EditProfileBody user={user} onClose={() => onOpenChange(false)} />}
    </AppDialog>
  );
}

interface BodyProps {
  user: Profile;
  onClose: () => void;
}

function EditProfileBody({ user, onClose }: BodyProps) {
  const router = useRouter();
  const { refreshProfile, resetPassword } = useAuth();
  const usernameValidation = useUsernameValidation(user.username);
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [email, setEmail] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);

  // Lazy-load the current auth email once on mount so we can show it
  // in the input and detect an actual change on save.
  const [currentEmail, setCurrentEmail] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { createBrowserSupabase } = await import("@/lib/supabase/client");
      const sb = createBrowserSupabase();
      const { data: { user: authUser } } = await sb.auth.getUser();
      if (cancelled) return;
      const e = authUser?.email ?? "";
      setCurrentEmail(e);
      setEmail(e);
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleChangeEmail() {
    if (!email || email === currentEmail || emailSaving) return;
    setEmailSaving(true);
    try {
      const { createBrowserSupabase } = await import("@/lib/supabase/client");
      const sb = createBrowserSupabase();
      const { error } = await sb.auth.updateUser({ email });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      showToast("Check your new inbox to confirm the change");
      setCurrentEmail(email);
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!currentEmail || resettingPw) return;
    setResettingPw(true);
    try {
      await resetPassword(currentEmail);
    } finally {
      setResettingPw(false);
    }
  }

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
      // Release the "Uploading…" state the moment the upload itself
      // succeeds. refreshProfile/router.refresh can take a second
      // because they re-fetch the profile + re-render RSC segments —
      // keeping the button locked through that read as "stuck".
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      showToast("Photo updated");
      // Background refetch — UI already shows success.
      refreshProfile();
      router.refresh();
      return;
    } catch {
      showToast("Something went wrong", "error");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
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
      onClose();
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
      onClose();
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

  // Body is rendered *inside* the outer `EditProfileDialog`'s
  // `AppDialog`, so no dialog wrapper here — just the content.
  return (
    <>
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

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Email</span>
          <input
            className={styles.input}
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {email !== currentEmail && email.length > 0 && (
            <Button
              variant="ghost"
              onClick={handleChangeEmail}
              disabled={emailSaving}
            >
              {emailSaving ? "Sending confirmation…" : "Send confirmation email"}
            </Button>
          )}
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Password</span>
          <Button
            variant="ghost"
            onClick={handleResetPassword}
            disabled={resettingPw || !currentEmail}
            fullWidth
          >
            {resettingPw ? "Sending reset link…" : "Reset password"}
          </Button>
        </div>
      </div>

      <SheetActions>
        <Button onClick={handleSave} disabled={submitting || uploading} fullWidth>
          {submitting ? "Saving..." : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={() => onClose()} fullWidth>
          Cancel
        </Button>
      </SheetActions>
    </>
  );
}
