import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabase } from "@/lib/supabase/middleware";

const AUTH_ROUTES = ["/login"];
const PUBLIC_ROUTES = ["/", "/privacy"];
const ONBOARDING_ROUTE = "/onboarding";

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isAuthenticated = !!user;

  // Redirect authenticated users away from login
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Public routes and login - no further checks needed
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) || PUBLIC_ROUTES.includes(pathname)) {
    return response;
  }

  // Everything else requires authentication
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check onboarding status for authenticated users on non-onboarding routes
  if (pathname !== ONBOARDING_ROUTE) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", user.id)
      .single();

    // No profile yet (trigger hasn't fired) or not onboarded - redirect
    if (!profile || !profile.onboarded) {
      return NextResponse.redirect(new URL(ONBOARDING_ROUTE, request.url));
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
