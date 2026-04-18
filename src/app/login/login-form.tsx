"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { FaCircleCheck, FaArrowUpRightFromSquare } from "react-icons/fa6";
import { useAuth } from "@/lib/auth-context";
import { RevealText } from "@/components/motion";
import { Button, ChorkMark, showToast } from "@/components/ui";
import { signInAction, signUpAction, type AuthActionState } from "./actions";
import styles from "./login.module.scss";

type Mode = "sign-in" | "sign-up";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Webmail provider lookup. The confirmation-pending screen shows an
 * "Open <Provider>" button that jumps straight to the user's inbox
 * so they don't have to tab-hunt. Detection is by the email's
 * domain — covers the top consumer providers, which catches the
 * vast majority of real signups. Unknown domains get no button
 * rather than a misleading one (mailto: opens compose, not inbox,
 * so we skip it entirely).
 */
type MailProvider = { label: string; url: string };

const MAIL_PROVIDERS: Record<string, MailProvider> = {
  "gmail.com": { label: "Open Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
  "googlemail.com": { label: "Open Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
  "outlook.com": { label: "Open Outlook", url: "https://outlook.live.com/mail/" },
  "hotmail.com": { label: "Open Outlook", url: "https://outlook.live.com/mail/" },
  "live.com": { label: "Open Outlook", url: "https://outlook.live.com/mail/" },
  "msn.com": { label: "Open Outlook", url: "https://outlook.live.com/mail/" },
  "yahoo.com": { label: "Open Yahoo Mail", url: "https://mail.yahoo.com/" },
  "yahoo.co.uk": { label: "Open Yahoo Mail", url: "https://mail.yahoo.com/" },
  "icloud.com": { label: "Open iCloud Mail", url: "https://www.icloud.com/mail" },
  "me.com": { label: "Open iCloud Mail", url: "https://www.icloud.com/mail" },
  "mac.com": { label: "Open iCloud Mail", url: "https://www.icloud.com/mail" },
  "proton.me": { label: "Open Proton Mail", url: "https://mail.proton.me/inbox" },
  "protonmail.com": { label: "Open Proton Mail", url: "https://mail.proton.me/inbox" },
};

function mailProviderForEmail(email: string): MailProvider | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return MAIL_PROVIDERS[domain] ?? null;
}

// Pull a server-returned field error out of whichever action state
// carries it. Only one of signIn/signUp is ever populated at a time
// (the form key-switches on mode), but the helper handles both so
// the render code doesn't have to care which flow is active.
function serverFieldError(
  signIn: AuthActionState | undefined,
  signUp: AuthActionState | undefined,
  field: "email" | "password",
): string | undefined {
  if (signIn?.error && signIn.field === field) return signIn.error;
  if (signUp?.error && signUp.field === field) return signUp.error;
  return undefined;
}

export function LoginForm() {
  const { resetPassword } = useAuth();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  // Tracks whether the user has typed into a field since the last
  // submission. Server errors render inline on a field only while
  // that field stays clean — the moment the user starts correcting,
  // the old error disappears so they aren't corrected mid-fix.
  const [dirty, setDirty] = useState({ email: false, password: false, confirm: false });

  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, undefined);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, undefined);
  const submitting = signInPending || signUpPending;

  // Snapshot the email at submit-time so the "check your inbox"
  // screen shows the right address even if the user keeps typing
  // into the input after the action resolves. Updating it in
  // `handleClientValidate` avoids a useEffect-setState-from-props
  // pattern (which the set-state-in-effect rule flags).
  const submittedEmailRef = useRef("");

  // Derived: we're in the "waiting for email confirmation" state if
  // signUp succeeded AND didn't give us a `next` (auto-confirm path).
  // Derived, not stored, so there's nothing to invalidate when the
  // action state changes — the view flips naturally on the next render.
  const confirmPendingEmail =
    signUpState?.success && !signUpState.next ? submittedEmailRef.current : null;

  // Server-returned field errors — derived at render so state stays
  // out of the loop (no useEffect + setState sync to the server
  // response, which the `react-hooks/set-state-in-effect` rule
  // flags). Displayed error per field: local validation (from
  // `errors`) wins, otherwise fall through to the server response if
  // the user hasn't started correcting that field yet.
  const serverEmailError = serverFieldError(signInState, signUpState, "email");
  const serverPasswordError = serverFieldError(signInState, signUpState, "password");

  const emailError = errors.email ?? (dirty.email ? undefined : serverEmailError);
  const passwordError = errors.password ?? (dirty.password ? undefined : serverPasswordError);

  // General (non-field) server errors + success signals toast. These
  // effects only call showToast — no setState, so the lint rule
  // above doesn't fire on them.
  useEffect(() => {
    if (signInState?.success && signInState.next) {
      // Flush the service-worker cache before the hard-nav — mirror
      // of the signOut flow in auth-context.tsx. Without this the
      // SW's stale-while-revalidate on any auth-variant shell URL
      // serves the previous (unauthed) HTML on the post-signin
      // request, and the user sees the landing page for a beat
      // even though the backend is authed. `/` was removed from
      // SHELL_URLS in public/sw.js to fix the root cause; this
      // flush is defence-in-depth against a future regression.
      if (
        typeof navigator !== "undefined" &&
        navigator.serviceWorker?.controller
      ) {
        navigator.serviceWorker.controller.postMessage({ type: "clear-cache" });
      }
      // Hard nav — remounts AuthProvider so the fresh auth cookies
      // land in its bootstrap effect and the nav flips to the
      // authed shell without a manual reload. See signInAction for
      // the full rationale.
      window.location.href = signInState.next;
      return;
    }
    if (!signInState?.error) return;
    if (!signInState.field || signInState.field === "general") {
      showToast(signInState.error, "error");
    }
  }, [signInState]);

  useEffect(() => {
    if (signUpState?.error) {
      if (!signUpState.field || signUpState.field === "general") {
        showToast(signUpState.error, "error");
      }
      return;
    }
    if (!signUpState?.success) return;

    // Two shapes of success:
    //   • `next` present → Supabase auto-confirmed the account
    //     (email confirmations disabled in the project). Session is
    //     already committed. Hard-nav to /onboarding so the user
    //     finishes setup instead of sitting on a form they've
    //     already submitted (re-submitting while authed hits the
    //     /login middleware redirect and crashes the server action).
    //   • `next` absent → email confirmation flow. Render the
    //     "check your inbox" view (derived from `confirmPendingEmail`
    //     below — no setState needed here).
    if (signUpState.next) {
      if (
        typeof navigator !== "undefined" &&
        navigator.serviceWorker?.controller
      ) {
        navigator.serviceWorker.controller.postMessage({ type: "clear-cache" });
      }
      window.location.href = signUpState.next;
      return;
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
    setDirty({ email: false, password: false, confirm: false });
    setConfirmPassword("");
  }

  // The form submits directly to the server action — Next handles the
  // redirect on success, so the client never has to chase auth-state
  // commits or hard-navigate. Client-side validation runs in onSubmit
  // before the action fires; bail with preventDefault if invalid.
  // Reset `dirty` so server errors from the new submission surface
  // immediately under the relevant field once the response lands.
  function handleClientValidate(e: React.FormEvent<HTMLFormElement>) {
    setDirty({ email: false, password: false, confirm: false });
    if (!validate()) {
      e.preventDefault();
      return;
    }
    // Capture the email at submit-time so the confirmation view
    // shows the right address even if the user edits the input
    // field after the action resolves.
    submittedEmailRef.current = email.trim();
  }

  // Render the "check your inbox" view whenever we're waiting on
  // email confirmation. Keeps the user on /login but visually
  // replaces the form — no more "is this working?" toast.
  if (confirmPendingEmail) {
    return (
      <ConfirmEmailScreen
        email={confirmPendingEmail}
        onUseDifferent={() => {
          // Clear signUpState so `confirmPendingEmail` goes null on
          // the next render. useActionState doesn't expose a reset
          // API; swapping the form's `key` back to "sign-up" isn't
          // enough either — the fix is to hard-reload the page.
          // Simple + predictable: user lands back on a clean /login.
          window.location.reload();
        }}
      />
    );
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
              className={`${styles.input} ${emailError ? styles.inputError : ""}`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setDirty((d) => ({ ...d, email: true }));
                setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && <p id="email-error" className={styles.error}>{emailError}</p>}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className={`${styles.input} ${passwordError ? styles.inputError : ""}`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setDirty((d) => ({ ...d, password: true }));
                setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              required
              minLength={mode === "sign-up" ? MIN_PASSWORD_LENGTH : undefined}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              aria-describedby={passwordError ? "password-error" : undefined}
            />
            {passwordError && <p id="password-error" className={styles.error}>{passwordError}</p>}
            {mode === "sign-up" && !passwordError && (
              <p className={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters</p>
            )}
            {mode === "sign-in" && (
              <button
                type="button"
                className={styles.forgotLink}
                onClick={async () => {
                  if (!email.trim()) {
                    setErrors({ email: "Enter your email first" });
                    setDirty((d) => ({ ...d, email: false }));
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
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setDirty((d) => ({ ...d, confirm: true }));
                  setErrors((prev) => ({ ...prev, confirm: undefined }));
                }}
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

/**
 * Post-signup confirmation screen. Replaces the form entirely while
 * we wait for the user to click the verification email. The
 * "Open <Provider>" button jumps straight to their webmail inbox
 * when we recognise the domain (Gmail, Outlook, iCloud, etc.);
 * unknown domains skip the button entirely — a misleading mailto:
 * link (which opens compose, not inbox) would be worse than
 * nothing.
 */
function ConfirmEmailScreen({
  email,
  onUseDifferent,
}: {
  email: string;
  onUseDifferent: () => void;
}) {
  const provider = mailProviderForEmail(email);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.confirmIconWrap} aria-hidden="true">
          <FaCircleCheck className={styles.confirmIcon} />
        </div>
        <RevealText
          text="Check your inbox"
          as="h1"
          className={styles.confirmHeading}
        />
        <p className={styles.confirmBody}>
          We sent a confirmation link to{" "}
          <span className={styles.confirmEmail}>{email}</span>.
          Click it to finish setting up your account.
        </p>

        {provider && (
          <a
            className={styles.confirmMailBtn}
            href={provider.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {provider.label}
            <FaArrowUpRightFromSquare aria-hidden className={styles.confirmMailBtnIcon} />
          </a>
        )}

        <p className={styles.confirmHint}>
          No email yet? Check spam, or{" "}
          <button
            type="button"
            className={styles.confirmUseDifferent}
            onClick={onUseDifferent}
          >
            try a different address
          </button>
          .
        </p>
      </div>
    </main>
  );
}
