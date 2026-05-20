import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

// Whitelist the OTP types we know Supabase Auth emits for this flow.
// `searchParams.get("type")` is unfettered user input — a hostile
// confirmation link could otherwise smuggle an arbitrary string into
// verifyOtp's `type` field and trip a path we haven't audited.
const VALID_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const satisfies readonly EmailOtpType[];

function isValidOtpType(raw: string): raw is EmailOtpType {
  return (VALID_OTP_TYPES as readonly string[]).includes(raw);
}

function parseOtpType(raw: string | null): EmailOtpType | null {
  return raw !== null && isValidOtpType(raw) ? raw : null;
}

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
  const type = parseOtpType(searchParams.get("type"));

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
