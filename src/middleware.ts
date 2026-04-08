import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabase } from "@/lib/supabase/middleware";

const PROTECTED_PREFIXES = ["/profile", "/onboarding", "/leaderboard", "/u"];
const AUTH_ROUTES = ["/login"];

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareSupabase(request);

  // getUser() validates the session with the Supabase server
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthenticated = !!user;

  // Redirect authenticated users away from auth routes
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users away from protected routes
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Return the response with refreshed cookies
  return response;
}

// Must be a static literal — Next.js evaluates this at build time.
export const config = {
  matcher: [
    "/login/:path*",
    "/onboarding/:path*",
    "/profile/:path*",
    "/leaderboard/:path*",
    "/u/:path*",
  ],
};
