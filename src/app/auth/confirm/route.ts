import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Direct email confirmation handler.
 *
 * Used when Supabase email templates render `{{ .TokenHash }}` URLs
 * pointing at this route (rather than `{{ .ConfirmationURL }}` which
 * sends users via `<project>.supabase.co/auth/v1/verify`). Keeping
 * every link in the outbound email on `chork.app` keeps the "sender
 * domain ↔ link domain" pair aligned — Resend flags the mismatched
 * variant as a spam-filter risk, and users are less likely to trust
 * a `hello@chork.app` email whose button points at a random Supabase
 * subdomain.
 *
 * Exchanges the (token_hash, type) pair server-side via
 * `verifyOtp()`, sets session cookies on the response, and redirects
 * to the app page the template specified.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Tight open-redirect guard: only single-leading-slash relative paths.
  // Matches the pattern used in /auth/callback/route.ts.
  const rawNext = searchParams.get("next") ?? "/onboarding";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/onboarding";

  if (tokenHash && type) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirmation-invalid", origin));
}
