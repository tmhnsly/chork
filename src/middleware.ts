import { NextResponse, type NextRequest } from "next/server";
import PocketBase from "pocketbase";

// Single source of truth for route protection.
// Middleware matcher is derived from these arrays below.
const PROTECTED_PREFIXES = ["/profile", "/onboarding", "/leaderboard", "/u"];
const AUTH_ROUTES = ["/login"];

const ALL_PREFIXES = [...PROTECTED_PREFIXES, ...AUTH_ROUTES];

export function middleware(request: NextRequest) {
  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL);
  pb.authStore.loadFromCookie(request.headers.get("cookie") ?? "");

  const { pathname } = request.nextUrl;
  const isAuthenticated = pb.authStore.isValid;

  if (AUTH_ROUTES.some((r) => pathname.startsWith(r)) && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

// Must be a static literal — Next.js evaluates this at build time.
// Keep in sync with PROTECTED_PREFIXES and AUTH_ROUTES above.
export const config = {
  matcher: ["/login/:path*", "/onboarding/:path*", "/profile/:path*", "/leaderboard/:path*", "/u/:path*"],
};
