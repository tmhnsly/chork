import { cookies } from "next/headers";
import { verify } from "@/lib/cookie-sign";
import { NavBar, type InitialShell } from "./NavBar";

const AUTH_SHELL_COOKIE = "chork-auth-shell";

/**
 * Map a **verified** shell cookie value to the nav variant.
 *
 * Exported for tests, and separate from the component because the
 * subtlety worth pinning is what happens when the value hasn't been
 * verified — see the test.
 */
export function shellFromCookie(value: string | null): InitialShell {
  if (value === "awg") return "authed-with-gym";
  if (value === "ang") return "authed-no-gym";
  return "unauthed";
}

/**
 * Server-rendered wrapper around the client `NavBar`. Reads the
 * `chork-auth-shell` cookie that the proxy stamps on every response
 * and tells the client component which shell to paint on first byte.
 *
 * Point of this indirection: without it, every refresh showed the
 * loading (brand-only) shell on server-render + first client render,
 * then flashed to the real nav once `AuthProvider` hydrated from
 * localStorage — the classic "nav pops in" bug. With the cookie,
 * SSR already knows the user's auth + gym state and the client
 * renders the matching shell on the very first frame.
 *
 * Three-state cookie:
 *   "u"   unauthed
 *   "ang" authed, no gym   → Crew / Jam / Profile tabs
 *   "awg" authed with gym  → Wall / Board / Crew / Jam / Profile
 *
 * The value MUST go through `verify` first. The proxy writes
 * `sign(value)`, which is `"awg.<sig>"` wherever `CHORK_COOKIE_SECRET`
 * is configured — so comparing the raw cookie against `"awg"` never
 * matches and silently yields the unauthed shell for everyone. That
 * shipped: production served the signed-out nav on every authed page
 * load, hydration corrected it a beat later, and the signed-out nav's
 * `/gyms` and `/login` links each fired an RSC prefetch on the way
 * past — six wasted function invocations per load, for a nav the
 * climber never saw.
 *
 * Verifying rather than just splitting on the dot is deliberate: this
 * is the same fast-path the proxy declines to trust when a signature
 * doesn't check out, and a forged cookie shouldn't buy a different
 * nav here either. Missing / unknown / forged all fall back to the
 * unauthed shell, which self-corrects on hydration.
 */
export async function NavBarShell() {
  const cookieStore = await cookies();
  const value = await verify(cookieStore.get(AUTH_SHELL_COOKIE)?.value);
  return <NavBar initialShell={shellFromCookie(value)} />;
}
