import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabase } from "@/lib/supabase/middleware";
import { sign, verify } from "@/lib/cookie-sign";

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
//   "ang"  authed, no gym   → Friends / Match / Profile tabs
//   "awg"  authed with gym  → Wall / Board / Friends / Match / Profile
//
// Non-critical — a stale or missing value just means the nav may
// briefly show the wrong shape, same as before this cookie existed.
// Bumped to v2 when the admin suffix was added. A v1 cookie holds
// "awg" / "ang", which is indistinguishable from "signed in and
// definitely not an admin" — so without a new name every existing
// user would resolve isAdmin=false forever and the tab would keep
// popping in for exactly the people who complained. Same reasoning as
// the v2 bump on the localStorage profile cache.
const AUTH_SHELL_COOKIE = "chork-auth-shell-v2";

/**
 * The nav variant, encoded for `NavBarShell`.
 *
 *   u     signed out
 *   ang   signed in, no gym
 *   awg   signed in, with a gym
 *   …a    …and runs at least one gym (the Admin tab)
 *
 * Kept as a short opaque token rather than JSON because it is signed
 * on every write and compared on every read.
 */
type ShellValue = "u" | "ang" | "awg" | "anga" | "awga";

export async function proxy(request: NextRequest) {
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
  // to Friends / Match / Profile). We don't fire an extra SELECT just for
  // this — the onboarded-check below runs on the same request anyway,
  // and extending it to read `active_gym_id` is a single column.
  //
  // Both cookies (`chork-onboarded` + `chork-auth-shell`) are perf
  // fast-path signals, NOT auth decisions — downstream pages always
  // re-read profiles via `requireAuth`. But middleware still shouldn't
  // trust arbitrary client-set values either, so we round-trip both
  // through `sign`/`verify`: a forged value from DevTools fails the
  // HMAC check and falls through to the slow path (same as a cache
  // miss) rather than granting the fast-path silently. When no
  // `CHORK_COOKIE_SECRET` is configured, the helpers degrade to
  // pass-through so local dev still boots.
  const existingShell = await verify(request.cookies.get(AUTH_SHELL_COOKIE)?.value);
  let nextShell: ShellValue = isAuthenticated ? "ang" : "u";

  // Signed-in users never need the login page.
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Unauthed: auth + public routes are fine, everything else → login.
  if (!isAuthenticated) {
    if (isAuthRoute || isPublic) return response;
    // Preserve the intended destination so login can bounce the visitor
    // back after signing in (the ?next= flow is already wired end-to-end
    // in login-form / login/actions). Same-origin pathname only.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  // Authed from here on. Resolve onboarded state via the cookie
  // fast-path, falling back to a profile read. The flag only ever
  // flips false → true once per user's lifetime, so the cookie
  // stays valid until the user id changes.
  //
  // `verify` unwraps the HMAC signature added below; a forged or
  // tampered cookie returns null so we fall through to the profile
  // read rather than trusting the DevTools-set value.
  const cached = await verify(request.cookies.get(ONBOARDED_COOKIE)?.value);
  const expected = `${user.id}:1`;
  let isOnboarded = cached === expected;
  let hasGym: boolean | null = null;
  let isAdmin: boolean | null = null;

  if (!isOnboarded) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded, active_gym_id")
      .eq("id", user.id)
      .single();
    isOnboarded = !!profile?.onboarded;
    hasGym = !!profile?.active_gym_id;

    if (isOnboarded) {
      response.cookies.set(ONBOARDED_COOKIE, await sign(expected), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365, // 1 year — invalidated on uid mismatch
        path: "/",
      });
    }
  }

  // Shell-cookie refinement for authed users. The cold-path profile
  // read above already populated `hasGym`, so this branch only fires
  // when the onboarded cookie was warm (skipped the read) AND the
  // shell cookie is missing / unknown. In that case we'd previously
  // fire a second identical SELECT just for the gym bit — wasted
  // work. The cold path now covers both cookies in one query; this
  // fallback stays as the last line of defence for the (rare) state
  // where both cookies have drifted.
  if (isAuthenticated) {
    if (hasGym === null) {
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
    // The admin suffix. Without it the server always renders the nav
    // WITHOUT the Admin tab and hydration adds it a beat later — the
    // tab visibly pops in on every single page load for anyone who
    // runs a gym. `isAdmin` is already in the localStorage profile
    // cache, which is why the rest of the nav paints correctly; the
    // server simply had no way to know.
    //
    // Costs one indexed lookup, and only on the cold path — once the
    // cookie is stamped, every subsequent nav reads it for free. Like
    // the rest of this cookie it is a PAINT HINT, never an auth
    // decision: /admin re-checks `requireGymAdmin` regardless, and a
    // stale value self-corrects on hydration.
    if (isAdmin === null) {
      if (existingShell === "awga" || existingShell === "anga") {
        isAdmin = true;
      } else if (existingShell === "awg" || existingShell === "ang") {
        isAdmin = false;
      } else {
        const { data: adminRow } = await supabase
          .from("gym_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        isAdmin = !!adminRow;
      }
    }

    nextShell = `${hasGym ? "awg" : "ang"}${isAdmin ? "a" : ""}` as ShellValue;
  }

  // Write the shell cookie whenever its value differs from what the
  // request brought in. Covers both the cold-path case (hasGym just
  // resolved from the profile read above) and drift recovery (shell
  // cookie was stale / unsigned / forged so `verify` returned null).
  if (existingShell !== nextShell) {
    response.cookies.set(AUTH_SHELL_COOKIE, await sign(nextShell), {
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
    "/friends/:path*",
    "/competitions/:path*",
    "/admin/:path*",
    "/privacy/:path*",
    "/terms/:path*",
    "/gyms/:path*",
    "/match/:path*",
  ],
};
