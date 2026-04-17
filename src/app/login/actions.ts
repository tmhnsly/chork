"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatError } from "@/lib/errors";

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
  prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: formatError(error) };
  }

  // Successful sign-in: cookies are committed to the response by the
  // SSR client. Redirect via Next so the next render sees the session.
  // Restrict the redirect target to same-origin paths — never honour
  // a fully-qualified URL from the form payload.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(safeNext);
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
  prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

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
    return { error: formatError(error) };
  }
  return { success: true };
}
