"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { RevealText } from "@/components/motion";
import { Button, ChorkMark, showToast } from "@/components/ui";
import styles from "./login.module.scss";

type Mode = "sign-in" | "sign-up";

const MIN_PASSWORD_LENGTH = 8;

export function LoginForm() {
  const { signIn, signUp, resetPassword, isLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});

  function validate(): boolean {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Enter a valid email address";
    }

    if (!password) {
      next.password = "Password is required";
    } else if (mode === "sign-up" && password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (mode === "sign-up" && password !== confirmPassword) {
      next.confirm = "Passwords don't match";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
    setErrors({});
    setConfirmPassword("");
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.brand}>
          <ChorkMark size={48} />
          <RevealText text="Chork" as="h1" className={styles.title} />
        </div>
        <p className={styles.tagline}>
          Track your sends. Compete with your crew.
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: undefined })); }}
              required
              autoComplete="email"
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && <p id="email-error" className={styles.error}>{errors.email}</p>}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: undefined })); }}
              required
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            {errors.password && <p id="password-error" className={styles.error}>{errors.password}</p>}
            {mode === "sign-up" && !errors.password && (
              <p className={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters</p>
            )}
            {mode === "sign-in" && (
              <button
                type="button"
                className={styles.forgotLink}
                onClick={async () => {
                  if (!email.trim()) {
                    setErrors({ email: "Enter your email first" });
                    return;
                  }
                  await resetPassword(email);
                }}
              >
                Forgot password?
              </button>
            )}
          </div>

          {mode === "sign-up" && (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                className={`${styles.input} ${errors.confirm ? styles.inputError : ""}`}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirm: undefined })); }}
                required
                autoComplete="new-password"
                aria-describedby={errors.confirm ? "confirm-error" : undefined}
              />
              {errors.confirm && <p id="confirm-error" className={styles.error}>{errors.confirm}</p>}
            </div>
          )}

          <Button type="submit" disabled={submitting || isLoading} fullWidth>
            {submitting
              ? "Loading..."
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          className={styles.toggle}
          onClick={switchMode}
        >
          {mode === "sign-in"
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
