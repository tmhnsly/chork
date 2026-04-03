import { NextResponse, type NextRequest } from "next/server";
import PocketBase from "pocketbase";

// Routes that require authentication — any path starting with these prefixes.
const PROTECTED_PREFIXES = ["/profile", "/onboarding", "/leaderboard"];

// Routes that redirect to home when already authenticated.
const AUTH_ROUTES = ["/login"];

export function middleware(request: NextRequest) {
  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL);
  pb.authStore.loadFromCookie(request.headers.get("cookie") ?? "");

  const { pathname } = request.nextUrl;
  const isAuthenticated = pb.authStore.isValid;

  // Redirect authenticated users away from auth routes
  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users away from protected routes
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login/:path*", "/onboarding/:path*", "/profile/:path*", "/leaderboard/:path*"],
};
