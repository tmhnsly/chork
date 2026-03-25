"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useUsernameValidation } from "@/hooks/use-username-validation";
import { FormField, Button, showToast } from "@/components/ui";
import { completeOnboarding } from "./actions";
import styles from "./onboarding.module.scss";

export function OnboardingForm() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const usernameValidation = useUsernameValidation();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const valid = await usernameValidation.validate(username, user.id);
    if (!valid) return;

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("name", displayName);

      const result = await completeOnboarding(formData);

      if (result.error) {
        showToast(result.error, "error");
        return;
      }

      if (result.cookie) {
        document.cookie = result.cookie;
      }
      refreshUser();
      router.push("/");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Set up your profile</h1>
        <p className={styles.subtitle}>
          Choose a username and personalize your account
        </p>

        <FormField
          id="username"
          label="Username *"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.currentTarget.value)}
          onBlur={() => user && usernameValidation.validate(username, user.id)}
          placeholder="your_username"
          required
          error={usernameValidation.error}
        />

        <FormField
          id="displayName"
          label="Display name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          placeholder="Your Name"
        />

        <Button
          type="submit"
          disabled={submitting || !username || !!usernameValidation.error}
          style={{ width: "100%" }}
        >
          {submitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </main>
  );
}
