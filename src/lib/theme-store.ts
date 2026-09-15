/**
 * Theme store — the client half of the palette, split from the
 * provider so tests can import it under vitest's unit project (which
 * has no React/JSX transform configured). The `ThemeProvider` +
 * `useTheme` hook live in `theme.tsx` and re-export these symbols; the
 * palette table and the palette cookie live in `theme-palettes.ts`,
 * which the server can import too.
 *
 * Module-level mutable state (`listeners`, `currentTheme`) makes this
 * intentionally client-only — on the server it would be shared across
 * concurrent requests and one climber's theme would bleed into
 * another's render. The `"client-only"` import enforces that boundary
 * at build time: any accidental server import will fail.
 */
import "client-only";
import {
  DEFAULT_THEME,
  PALETTE_COOKIE,
  PALETTE_COOKIE_MAX_AGE,
  isValidTheme,
  type ThemeName,
} from "./theme-palettes";

export { THEME_META, DEFAULT_THEME, isValidTheme } from "./theme-palettes";
export type { ThemeName, ThemeMeta } from "./theme-palettes";

type Listener = () => void;
const listeners = new Set<Listener>();

// Where the palette comes from.
//
// The theme belongs to the climber, so `profiles.theme` is the single
// source of truth and the signed-in profile is the only thing that can
// decide it. It used to be mirrored into a `chork-theme` localStorage
// key, which made the palette a property of the *device*: it outlived
// the session, so signing out left your palette on the login screen
// and on whoever signed in next.
//
// The palette cookie (`PALETTE_COOKIE`) is not that mirror coming back.
// It exists only so the server can paint the right palette on the
// first frame, and it never decides anything: the profile settling
// overwrites it, the profile going away clears it (signed out resolves
// to the default on every path, not just the sign-out button), and the
// server drops it with a dead session. Until the profile settles, the
// store keeps whatever the server painted.

/** The palette the server painted on `<html>`, read once as this module loads. */
function paintedTheme(): ThemeName {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const painted = document.documentElement.getAttribute("data-theme");
  return isValidTheme(painted) ? painted : DEFAULT_THEME;
}

let currentTheme: ThemeName = paintedTheme();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ThemeName {
  return currentTheme;
}

/**
 * Apply a theme the climber picked: paint it at once and remember it
 * for the server. The profile write-back is `setTheme()` in
 * `theme.tsx`; this is only the local half.
 */
export function setThemeStore(next: ThemeName): void {
  if (next === currentTheme) return;
  currentTheme = next;
  applyTheme(next);
  persistPalette(next);
  listeners.forEach((fn) => fn());
}

/**
 * Bridge entry — fed by the auth profile whenever it resolves or
 * changes. This is the ONLY thing that decides which palette is in
 * effect once auth has settled.
 *
 * Anything that isn't a valid theme name — a signed-out `undefined`,
 * a stale or hand-edited DB value — resolves to the default rather
 * than being ignored. "No valid climber preference" and "the default
 * palette" are the same state, so signing out needs no separate reset
 * path; the profile going away is the reset.
 *
 * Callers must wait for auth to settle before calling this. A
 * pre-bootstrap profile is legitimately null for a signed-IN climber
 * too, and acting on that null would paint the default over the
 * palette the server painted.
 */
export function syncThemeFromProfile(
  profileTheme: string | null | undefined,
): void {
  const next = isValidTheme(profileTheme) ? profileTheme : DEFAULT_THEME;
  // Every settle refreshes the cookie: it keeps the year rolling, and
  // repairs one that was cleared or never written.
  persistPalette(next);
  if (next === currentTheme) return;
  currentTheme = next;
  applyTheme(next);
  listeners.forEach((fn) => fn());
}

/**
 * Write the theme attribute to `<html>`. `default` clears the
 * attribute so the bare `:root` styles take over. Nothing is written
 * when the attribute is already right, which is the common case now
 * that the server paints the palette.
 *
 * Transitions are held off for the swap. Buttons animate their
 * background, so a palette change mid-page faded every one of them
 * through the colours in between: lime to teal to blue.
 */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const target = theme === DEFAULT_THEME ? null : theme;
  if (root.getAttribute("data-theme") === target) return;
  const release = holdTransitions();
  if (target === null) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", target);
  release();
}

/** Switch transitions off; the returned release hands them back after a painted frame. */
function holdTransitions(): () => void {
  if (typeof window === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);
  return () => {
    // Resolve the new palette's styles while transitions are off…
    void window.getComputedStyle(document.body).color;
    // …then hand transitions back once that frame has painted.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => style.remove()),
    );
  };
}

/** Remember the palette for the server's next paint — see `PALETTE_COOKIE`. */
function persistPalette(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  if (theme === DEFAULT_THEME) {
    // Signed out, or on Chork: no cookie, and no write when there is none.
    if (!new RegExp(`(?:^|;\\s*)${PALETTE_COOKIE}=`).test(document.cookie)) return;
    document.cookie = `${PALETTE_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    return;
  }
  document.cookie = `${PALETTE_COOKIE}=${theme}; path=/; max-age=${PALETTE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}
