import { NextResponse, type NextRequest } from "next/server";
import PocketBase from "pocketbase";

export function middleware(request: NextRequest) {
  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL);
  pb.authStore.loadFromCookie(request.headers.get("cookie") ?? "");

  const { pathname } = request.nextUrl;
  const isAuthenticated = pb.authStore.isValid;

  // /login — redirect to home if already authenticated
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Protected routes — redirect to login if not authenticated
  if ((pathname === "/profile" || pathname === "/onboarding") && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/onboarding", "/profile"],
};
