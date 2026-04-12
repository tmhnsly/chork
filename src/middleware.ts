import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabase } from "@/lib/supabase/middleware";

const AUTH_ROUTES = ["/login"];
const PUBLIC_ROUTES = ["/", "/privacy"];
const ONBOARDING_ROUTE = "/onboarding";
const ONBOARDED_COOKIE = "chork-onboarded";

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isAuthenticated = !!user;

  // Redirect authenticated users away from login
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Public routes and login — no further checks needed
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) || PUBLIC_ROUTES.includes(pathname)) {
    return response;
  }

  // Everything else requires authentication
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Onboarding gate. We used to hit `profiles.select("onboarded")` on
  // every authenticated request — a ~50-100ms Supabase round-trip per
  // page nav. The flag only ever transitions false→true (once per
  // user's lifetime), so we cache it in a cookie once confirmed and
  // skip the query on subsequent requests.
  if (pathname !== ONBOARDING_ROUTE) {
    // Cookie value format: "<user_id>:1" so a user switch invalidates
    // the fast path automatically (the cached uid no longer matches).
    const cached = request.cookies.get(ONBOARDED_COOKIE)?.value;
    const expected = `${user.id}:1`;
    if (cached !== expected) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.onboarded) {
        return NextResponse.redirect(new URL(ONBOARDING_ROUTE, request.url));
      }

      response.cookies.set(ONBOARDED_COOKIE, expected, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365, // 1 year — invalidated on uid mismatch
        path: "/",
      });
    }
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
    "/privacy/:path*",
  ],
};
