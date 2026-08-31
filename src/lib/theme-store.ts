/**
 * Theme store — pure (non-JSX) half of the theme module, split out
 * so tests can import it under vitest's unit project (which has no
 * React/JSX transform configured). The `ThemeProvider` + `useTheme`
 * hook live in `theme.tsx` and re-export these symbols.
 *
 * Module-level mutable singletons (`listeners`, `currentTheme`) make
 * this intentionally client-only — on the server they'd be shared
 * across concurrent requests and one climber's theme would bleed
 * into another's render. The `"client-only"` import enforces that
 * boundary at build time: any accidental server import will fail.
 */
import "client-only";

export type ThemeName = "default" | "blue" | "violet" | "pink";

export interface ThemeMeta {
  id: ThemeName;
  label: string;
  hint: string;
}

/**
 * The four palettes, in picker order.
 *
 * `hint` names the two Radix scales rather than describing a mood.
 * The preview beside each row shows what the palette actually looks
 * like, so the text's job is to be precise, not evocative.
 *
 * There is no swatch field any more. Two dots couldn't answer "what
 * will my app look like" — which is why picking a theme used to mean
 * applying it, closing the sheet, looking, and going back in.
 * `<ThemePreview>` renders a real fragment of the wall in each
 * palette instead, scoped with `data-theme`, so all four can be
 * compared side by side without changing anything.
 */
// Labels name the mood; hints read the chord (mono · accent · flash
// · zone). Ids are STORAGE — profiles.theme holds them — and never
// change with a rename.
export const THEME_META: ThemeMeta[] = [
  { id: "default", label: "Chork", hint: "Lime · Amber · Teal" },
  { id: "blue", label: "Harbour", hint: "Blue · Amber · Jade" },
  { id: "violet", label: "Dusk", hint: "Violet · Yellow · Cyan" },
  { id: "pink", label: "Arcade", hint: "Pink · Amber · Cyan" },
];

export const DEFAULT_THEME: ThemeName = "default";

type Listener = () => void;
const listeners = new Set<Listener>();
let currentTheme: ThemeName = DEFAULT_THEME;

export function isValidTheme(t: string | null | undefined): t is ThemeName {
  return !!t && THEME_META.some((meta) => meta.id === t);
}

// This store deliberately does NOT persist.
//
// The theme belongs to the climber, so `profiles.theme` is the single
// source of truth and the signed-in profile is the only thing that
// can set it. It used to be mirrored into a `chork-theme` localStorage
// key as well, which made the palette a property of the *device*: it
// outlived the session, so signing out left your palette on the login
// screen and on whoever signed in next. That needed a sign-out reset
// to paper over — and one existed, in `signOut()` — but the reset only
// covered the deliberate sign-out path, not an expired session or a
// sign-out in another tab.
//
// Deriving from the profile removes the whole class of problem instead
// of handling its cases: no profile, no theme. The `AuthProvider`
// profile cache (which already carries `theme`, and is already dropped
// on sign-out) supplies it on the first client render, so a warm start
// still paints the right palette without a second copy to keep in step.

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ThemeName {
  return currentTheme;
}

export function getServerSnapshot(): ThemeName {
  return DEFAULT_THEME;
}

/**
 * Apply a theme locally, for immediate feedback while the picker is
 * open. The server write-back is `setTheme()` in `theme.tsx`; this is
 * only the local half.
 */
export function setThemeStore(next: ThemeName): void {
  if (next === currentTheme) return;
  currentTheme = next;
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
 * too, and acting on that null would flash the default palette on
 * every page load before snapping back.
 */
export function syncThemeFromProfile(
  profileTheme: string | null | undefined,
): void {
  const next = isValidTheme(profileTheme) ? profileTheme : DEFAULT_THEME;
  if (next === currentTheme) return;
  currentTheme = next;
  listeners.forEach((fn) => fn());
}

/**
 * Write the theme attribute to `<html>`. `default` clears the
 * attribute so the bare `:root` styles take over.
 */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (theme === DEFAULT_THEME) {
    el.removeAttribute("data-theme");
  } else {
    el.setAttribute("data-theme", theme);
  }
}
