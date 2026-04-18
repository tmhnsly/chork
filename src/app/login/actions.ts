"use server";

import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatAuthError, formatError, type AuthErrorField } from "@/lib/errors";

export interface AuthActionState {
  error?: string;
  field?: AuthErrorField;
  success?: boolean;
  /**
   * Post-login redirect target. Returned (not triggered via
   * `redirect()`) so the client can hard-navigate — that remounts
   * `AuthProvider` so the new session cookies get picked up. Soft
   * redirects via `next/navigation`'s `redirect()` left the provider
   * instance stale from the pre-sign-in render, which is why the nav
   * stayed in its logged-out state until a manual page reload.
   */
  next?: string;
}

/**
 * Server-side sign-in. Doing this client-side caused a race: the
 * browser Supabase client wrote auth cookies via document.cookie
 * asynchronously, then `window.location.href = "/"` fired before
 * the cookies were committed. The middleware on the new request
 * saw no session and bounced back to /login.
 *
 * Server action runs through @supabase/ssr server client, which
 * sets cookies via the Next cookies() API. Those land as proper
 * Set-Cookie headers on the action response, so by the time the
 * caller's `next/navigation` redirect fires, the browser has the
 * session in its cookie jar — middleware sees authed, lets the
 * destination through.
 *
 * Returns shape mirrors the rest of the action surface:
 * `{ error: string }` on failure; on success the function throws
 * via `redirect()` (Next-internal control flow).
 */
export async function signInAction(
  prevState: AuthActionState | undefined,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email) return { error: "Email is required", field: "email" };
  if (!password) return { error: "Password is required", field: "password" };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const { message, field } = formatAuthError(error);
    return { error: message, field };
  }

  // Cookies are committed to the response by the SSR client above.
  // Return `next` to the client instead of calling Next's redirect()
  // so the browser can hard-navigate — that remounts AuthProvider so
  // its localStorage + supabase-session bootstrap re-runs with the
  // new cookies. Soft redirects left the provider in its
  // logged-out state and the nav didn't flip without a manual
  // reload. Restrict to same-origin paths; never honour a
  // fully-qualified URL from the form payload.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return { success: true, next: safeNext };
}

/**
 * Server-side sign-out. Same cookie-race rationale as signIn — the
 * browser client's `auth.signOut()` writes cookie-clearing headers
 * asynchronously, so `window.location.href = "/"` fired from the
 * client raced the cookie commit: the subsequent request often
 * landed on the server still-authed, middleware passed it through,
 * the page rendered in signed-in mode, and the user had to hard-
 * refresh to actually log out.
 *
 * Running through the SSR client means the Set-Cookie headers that
 * clear the session land on this action's response. By the time
 * the caller navigates, the browser has already applied them —
 * middleware sees anon, renders the logged-out shell.
 */
export async function signOutAction(): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signOut();

  // Belt-and-braces — clear the non-Supabase auth cookies regardless
  // of whether auth.signOut() succeeded. Those cookies are always
  // stale after any signout ATTEMPT; leaving them behind lets the
  // previous session's shape leak into the next render (wrong nav
  // variant on /login, a bogus onboarded fast-path stamp that
  // bypasses the profile SELECT in middleware).
  //
  // `chork-onboarded` gates middleware's profile-read fast-path.
  // `chork-auth-shell` tells `NavBarShell` which variant to paint
  // on first byte (authed-with-gym / authed-no-gym / unauthed).
  const jar = await cookies();
  jar.delete("chork-onboarded");
  jar.delete("chork-auth-shell");

  if (error) {
    return { error: formatError(error) };
  }
  return {};
}



/**
 * Sign-up server action. Same cookie-commit motivation as signIn.
 * The verification email is sent by Supabase; redirect lands on the
 * /auth/callback page with `?next=/onboarding` so the climber starts
 * the onboarding flow when they confirm.
 */
export async function signUpAction(
  prevState: AuthActionState | undefined,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email) return { error: "Email is required", field: "email" };
  if (!password) return { error: "Password is required", field: "password" };

  const supabase = await createServerSupabase();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chork.vercel.app";
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding`,
    },
  });
  if (error) {
    const { message, field } = formatAuthError(error);
    return { error: message, field };
  }
  return { success: true };
}
