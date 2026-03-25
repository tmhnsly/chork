"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { UsersResponse } from "@/lib/pocketbase-types";
import { getAvatarUrl } from "@/lib/avatar";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { Button, showToast } from "@/components/ui";
import { updateProfile } from "./actions";
import styles from "./profile.module.scss";

interface Props {
  user: UsersResponse;
}

export function ProfileForm({ user }: Props) {
  const router = useRouter();
  const { signOut } = useAuth();
  const usernameValidation = useUsernameValidation(user.username);

  const [editing, setEditing] = useState<string | null>(null);
  const [username, setUsername] = useState(user.username ?? "");
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const avatarSrc = avatarPreview ?? getAvatarUrl(user, { thumb: "200x200" });

  // Pick + save avatar in one step
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
      if (result.cookie) {
        document.cookie = result.cookie;
      }
      showToast("Photo updated");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
      setAvatarPreview(null);
    } finally {
      setSubmitting(false);
    }
  }

  function cancelEdit(field: string) {
    if (field === "username") {
      setUsername(user.username ?? "");
      usernameValidation.setError("");
    } else if (field === "name") {
      setDisplayName(user.name ?? "");
    }
    setEditing(null);
  }

  async function saveField(field: string) {
    if (field === "username") {
      const valid = await usernameValidation.validate(username, user.id);
      if (!valid) return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      if (field === "username") formData.append("username", username);
      if (field === "name") formData.append("name", displayName);

      const result = await updateProfile(formData);
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      if (result.cookie) {
        document.cookie = result.cookie;
      }
      setEditing(null);
      const labels: Record<string, string> = {
        username: "Username updated",
        name: "Display name updated",
      };
      showToast(labels[field] ?? "Profile updated");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.profileHeader}>
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
          <div className={styles.identity}>
            <h1 className={styles.name}>{user.name || user.username}</h1>
            <p className={styles.usernameDisplay}>@{user.username}</p>
          </div>
        </div>

        <div className={styles.fields}>
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>Username</span>
              {editing !== "username" && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setEditing("username")}
                >
                  Edit
                </Button>
              )}
            </div>
            {editing === "username" ? (
              <div className={styles.fieldEdit}>
                <input
                  className={styles.input}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() =>
                    usernameValidation.validate(username, user.id)
                  }
                />
                {usernameValidation.error && (
                  <span className={styles.fieldError}>
                    {usernameValidation.error}
                  </span>
                )}
                <div className={styles.fieldActions}>
                  <Button
                    type="button"
                    onClick={() => saveField("username")}
                    disabled={submitting || !!usernameValidation.error}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => cancelEdit("username")}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className={styles.fieldValue}>@{user.username}</p>
            )}
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <span className={styles.label}>Display name</span>
              {editing !== "name" && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setEditing("name")}
                >
                  Edit
                </Button>
              )}
            </div>
            {editing === "name" ? (
              <div className={styles.fieldEdit}>
                <input
                  className={styles.input}
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <div className={styles.fieldActions}>
                  <Button
                    type="button"
                    onClick={() => saveField("name")}
                    disabled={submitting}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => cancelEdit("name")}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className={styles.fieldValue}>{user.name || "\u2014"}</p>
            )}
          </div>
        </div>

        <div className={styles.signOutSection}>
          <Button variant="danger" type="button" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
