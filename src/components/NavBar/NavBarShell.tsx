import { cookies } from "next/headers";
import { NavBar, type InitialShell } from "./NavBar";

const AUTH_SHELL_COOKIE = "chork-auth-shell";

/**
 * Server-rendered wrapper around the client `NavBar`. Reads the
 * `chork-auth-shell` cookie that middleware stamps on every response
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
 * Missing / unknown cookie falls back to the unauthed shell. Stale
 * values self-correct the moment middleware next runs.
 */
export async function NavBarShell() {
  const cookieStore = await cookies();
  const value = cookieStore.get(AUTH_SHELL_COOKIE)?.value;
  let initialShell: InitialShell = "unauthed";
  if (value === "awg") initialShell = "authed-with-gym";
  else if (value === "ang") initialShell = "authed-no-gym";
  return <NavBar initialShell={initialShell} />;
}
