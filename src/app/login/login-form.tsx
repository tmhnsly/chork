"use client";

import { FaMountain } from "react-icons/fa6";
import { useAuth } from "@/lib/auth-context";
import { Button, GoogleLogo } from "@/components/ui";
import styles from "./login.module.scss";

export function LoginForm() {
  const { signInWithGoogle, isLoading } = useAuth();

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.brand}>
          <FaMountain className={styles.logo} />
          <h1 className={styles.title}>Chork</h1>
        </div>
        <p className={styles.tagline}>
          Track your sends. Compete with your crew.
        </p>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={signInWithGoogle}
            disabled={isLoading}
            fullWidth
          >
            <GoogleLogo /> Continue with Google
          </Button>
        </div>
        <p className={styles.hint}>
          Sign in to log routes, track your progress, and see the leaderboard.
        </p>
      </div>
    </main>
  );
}
