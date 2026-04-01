"use client";

import { useAuth } from "@/lib/auth-context";
import { Button, GoogleLogo } from "@/components/ui";
import styles from "./login.module.scss";

export function LoginForm() {
  const { signInWithGoogle, isLoading } = useAuth();

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome to Chork</h1>
        <p className={styles.subtitle}>Sign in to get started</p>
        <Button
          variant="secondary"
          onClick={signInWithGoogle}
          disabled={isLoading}
          fullWidth
        >
          <GoogleLogo /> Continue with Google
        </Button>
      </div>
    </main>
  );
}
