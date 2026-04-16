"use client";

import { useActionState, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { RevealText } from "@/components/motion";
import { Button, ChorkMark, showToast } from "@/components/ui";
import { signInAction, signUpAction } from "./actions";
import styles from "./login.module.scss";

type Mode = "sign-in" | "sign-up";

const MIN_PASSWORD_LENGTH = 8;

export function LoginForm() {
  const { resetPassword } = useAuth();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});

  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, undefined);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, undefined);
  const submitting = signInPending || signUpPending;

  // Surface server-action errors via toast — keeps the field-level
  // validation UI for client-side checks, the toast for server-side
  // failures (wrong password, account already exists, etc.).
  useEffect(() => {
    if (signInState?.error) showToast(signInState.error, "error");
  }, [signInState]);
  useEffect(() => {
    if (signUpState?.error) showToast(signUpState.error, "error");
    if (signUpState?.success) {
      showToast("Account created — check your email to confirm", "info");
    }
  }, [signUpState]);

  function validate(): boolean {
    const nextErrors: typeof errors = {};

    if (!email.trim()) {
      nextErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter a valid email address";
    }

    if (!password) {
      nextErrors.password = "Password is required";
    } else if (mode === "sign-up" && password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (mode === "sign-up" && password !== confirmPassword) {
      nextErrors.confirm = "Passwords don't match";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function switchMode() {
    setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
    setErrors({});
    setConfirmPassword("");
  }

  // The form submits directly to the server action — Next handles the
  // redirect on success, so the client never has to chase auth-state
  // commits or hard-navigate. Client-side validation runs in onSubmit
  // before the action fires; bail with preventDefault if invalid.
  function handleClientValidate(e: React.FormEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
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

        {/*
          The form is keyed by `mode` so toggling between sign-in and
          sign-up remounts a fresh DOM tree. Safari snapshots a form's
          autocomplete semantics on first paint; in-place autocomplete
          changes (`current-password` ↔ `new-password`) are often
          ignored, which is what was suppressing the strong-password
          suggestion + save prompt on sign-up.
         */}
        <form
          key={mode}
          className={styles.form}
          action={mode === "sign-in" ? signInFormAction : signUpFormAction}
          onSubmit={handleClientValidate}
          method="post"
          noValidate
        >
          {/* Hidden field passes the post-login redirect target through
              to the server action without exposing it in the visible UI. */}
          {mode === "sign-in" && <input type="hidden" name="next" value={next} />}

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: undefined })); }}
              required
              autoComplete="username email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && <p id="email-error" className={styles.error}>{errors.email}</p>}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: undefined })); }}
              required
              minLength={mode === "sign-up" ? MIN_PASSWORD_LENGTH : undefined}
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
                name="confirmPassword"
                type="password"
                className={`${styles.input} ${errors.confirm ? styles.inputError : ""}`}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirm: undefined })); }}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                aria-describedby={errors.confirm ? "confirm-error" : undefined}
              />
              {errors.confirm && <p id="confirm-error" className={styles.error}>{errors.confirm}</p>}
            </div>
          )}

          <Button type="submit" disabled={submitting} fullWidth>
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
