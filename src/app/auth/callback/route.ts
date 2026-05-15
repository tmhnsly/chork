import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Auth callback route - handles the redirect from Supabase email confirmation.
 * Exchanges the auth code for a session, then redirects to the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Validate next is a relative path to prevent open redirect attacks
  const rawNext = searchParams.get("next") ?? "/onboarding";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/onboarding";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Reach here when: `code` is missing entirely (someone hit /auth/callback
  // directly with no params) OR `exchangeCodeForSession` rejected (expired
  // / re-used / malformed code). Surface a specific error key so the
  // login page can toast something more useful than "you're signed out
  // for unstated reasons." Matches the pattern /auth/confirm uses for
  // its own failure modes (`?error=confirmation-invalid`).
  return NextResponse.redirect(new URL("/login?error=link-expired", origin));
}
