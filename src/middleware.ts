import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabase } from "@/lib/supabase/middleware";

const AUTH_ROUTES = ["/login"];
// Routes an UNAUTHED visitor may reach without a login redirect.
// Authed users landing here fall through to the onboarding gate
// like any other route — previously `/` short-circuited, which let
// freshly-signed-up users see the homepage before completing the
// onboarding form and trapped anyone who refreshed mid-flow.
const PUBLIC_ROUTES = ["/", "/privacy"];
const ONBOARDING_ROUTE = "/onboarding";
const ONBOARDED_COOKIE = "chork-onboarded";

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isAuthenticated = !!user;
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  // Signed-in users never need the login page.
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Unauthed: auth + public routes are fine, everything else → login.
  if (!isAuthenticated) {
    if (isAuthRoute || isPublic) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authed from here on. Resolve onboarded state via the cookie
  // fast-path, falling back to a profile read. The flag only ever
  // flips false → true once per user's lifetime, so the cookie
  // stays valid until the user id changes.
  const cached = request.cookies.get(ONBOARDED_COOKIE)?.value;
  const expected = `${user.id}:1`;
  let isOnboarded = cached === expected;

  if (!isOnboarded) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", user.id)
      .single();
    isOnboarded = !!profile?.onboarded;

    if (isOnboarded) {
      response.cookies.set(ONBOARDED_COOKIE, expected, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365, // 1 year — invalidated on uid mismatch
        path: "/",
      });
    }
  }

  // Already onboarded users shouldn't be able to revisit /onboarding
  // — previously they could land there via a refresh and get stuck
  // because nothing redirected them away.
  if (pathname === ONBOARDING_ROUTE && isOnboarded) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Not onboarded yet — force the flow before any app route.
  if (pathname !== ONBOARDING_ROUTE && !isOnboarded) {
    return NextResponse.redirect(new URL(ONBOARDING_ROUTE, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login/:path*",
    "/onboarding/:path*",
    "/profile/:path*",
    "/leaderboard/:path*",
    "/u/:path*",
    "/crew/:path*",
    "/competitions/:path*",
    "/admin/:path*",
    "/privacy/:path*",
  ],
};
