import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabase } from "@/lib/supabase/middleware";

const AUTH_ROUTES = ["/login"];
// Routes an UNAUTHED visitor may reach without a login redirect.
// Authed users landing here fall through to the onboarding gate
// like any other route — previously `/` short-circuited, which let
// freshly-signed-up users see the homepage before completing the
// onboarding form and trapped anyone who refreshed mid-flow.
const PUBLIC_ROUTES = ["/", "/privacy", "/terms", "/gyms"];
// Routes whose render does NOT depend on auth state — middleware can
// skip the getUser() round-trip entirely. /privacy + /terms look
// identical for signed-in and signed-out users, so there's no value
// in firing the Supabase auth call on every visit. The nav shell
// cookie (see below) is already stamped from any prior authed page
// view — missing means we default to the unauthed shell, which is
// acceptable for the rare first-ever-visit case.
const AUTH_AGNOSTIC_ROUTES = ["/privacy", "/terms"];
const ONBOARDING_ROUTE = "/onboarding";
const ONBOARDED_COOKIE = "chork-onboarded";
// Tells the server-rendered `NavBarShell` which variant of the nav
// to paint on first byte, so refreshing an authed page doesn't
// flash the unauthed (or brand-only) shell before `AuthProvider`
// bootstraps from localStorage.
//
// Values:
//   "u"    unauthed
//   "ang"  authed, no gym   → Crew / Jam / Profile tabs
//   "awg"  authed with gym  → Wall / Board / Crew / Jam / Profile tabs
//
// Non-critical — a stale or missing value just means the nav may
// briefly show the wrong shape, same as before this cookie existed.
const AUTH_SHELL_COOKIE = "chork-auth-shell";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast-path: pages whose output doesn't depend on who's looking
  // at them skip auth entirely. Saves one Supabase round-trip per
  // cold visit (matters for /privacy crawl + share-link previews).
  if (AUTH_AGNOSTIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return NextResponse.next();
  }

  const { supabase, response } = createMiddlewareSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user;
  // Match AUTH_ROUTES the same way PUBLIC_ROUTES does — exact
  // match OR prefix-with-slash. Plain `startsWith(r)` meant
  // "/login-anything" (e.g. "/login-wall-of-shame") was treated
  // as an auth route, which redirected authed users from unrelated
  // pages AND let unauthed users skip the public-route fallback.
  const isAuthRoute = AUTH_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  const isPublic = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  // Stamp the nav shell cookie so `NavBarShell` paints the correct
  // variant on first byte. The gym-aware value lets the pre-hydration
  // nav hide Wall + Board for gymless users (who still have access
  // to Crew / Jam / Profile). We don't fire an extra SELECT just for
  // this — the onboarded-check below runs on the same request anyway,
  // and extending it to read `active_gym_id` is a single column.
  const existingShell = request.cookies.get(AUTH_SHELL_COOKIE)?.value;
  let nextShell: "u" | "ang" | "awg" = isAuthenticated ? "ang" : "u";

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
  let hasGym: boolean | null = null;

  if (!isOnboarded) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded, active_gym_id")
      .eq("id", user.id)
      .single();
    isOnboarded = !!profile?.onboarded;
    hasGym = !!profile?.active_gym_id;

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

  // Shell-cookie refinement for authed users: if we don't know the
  // gym state yet (warm onboarded-cookie path skipped the profile
  // read), peek the existing shell cookie and only upgrade when it
  // doesn't match. Avoids an extra SELECT on every page nav.
  if (isAuthenticated) {
    if (hasGym === null) {
      // Warm path — trust the existing cookie's gym bit if present,
      // otherwise query once to seed it.
      if (existingShell === "awg" || existingShell === "ang") {
        hasGym = existingShell === "awg";
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("active_gym_id")
          .eq("id", user.id)
          .single();
        hasGym = !!profile?.active_gym_id;
      }
    }
    nextShell = hasGym ? "awg" : "ang";
  }

  if (existingShell !== nextShell) {
    response.cookies.set(AUTH_SHELL_COOKIE, nextShell, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
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
    "/terms/:path*",
    "/gyms/:path*",
    "/jam/:path*",
  ],
};
