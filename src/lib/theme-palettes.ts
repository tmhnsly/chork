/**
 * The four palettes, and the cookie that lets the server paint one.
 *
 * Server-safe on purpose — no `client-only`, no React — because the
 * root layout and `signOutAction` need the cookie and the ids.
 * `theme-store.ts` re-exports the palette table, so existing imports
 * of `@/lib/theme` and `@/lib/theme-store` keep working.
 */

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
  { id: "blue", label: "Harbour", hint: "Blue · Gold · Jade" },
  { id: "violet", label: "Dusk", hint: "Violet · Yellow · Cyan" },
  { id: "pink", label: "Arcade", hint: "Pink · Amber · Mint" },
];

export const DEFAULT_THEME: ThemeName = "default";

export function isValidTheme(t: string | null | undefined): t is ThemeName {
  return !!t && THEME_META.some((meta) => meta.id === t);
}

/**
 * The palette cookie — a PAINT HINT, never the preference itself.
 *
 * `profiles.theme` is the climber's palette, and the profile only
 * reaches the browser after hydration. So every page load used to
 * paint the default Chork lime first and swap to the climber's palette
 * a beat later: 110ms after first paint in Chromium and 220ms in
 * WebKit, measured on production for a Harbour climber on 2026-09-15,
 * and the swap animated through teal on the way. The root layout now
 * reads this cookie and renders `data-theme` on `<html>`, so the first
 * paint is already right — the trick `chork-auth-shell` plays for the
 * nav.
 *
 * Written by the client store whenever the palette settles from the
 * profile or the climber picks one. Cleared by the store when the
 * profile goes away (signed out resolves to the default), by
 * `signOutAction`, and by the proxy's dead-session purge. A stale or
 * forged value costs one repaint once the profile settles, and can
 * only ever name one of the four palettes.
 *
 * Pages rendered `force-static` (privacy, terms, gyms) see no cookies,
 * so they still paint the default and the store repaints after
 * hydration, without the fade.
 */
export const PALETTE_COOKIE = "chork-palette";

/** A year, refreshed every time the palette settles. */
export const PALETTE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The palette a cookie names; anything else is the default. */
export function themeFromCookie(value: string | null | undefined): ThemeName {
  return isValidTheme(value) ? value : DEFAULT_THEME;
}

/** `data-theme` for `<html>`: none for the default, so bare `:root` applies. */
export function htmlThemeAttribute(theme: ThemeName): ThemeName | undefined {
  return theme === DEFAULT_THEME ? undefined : theme;
}
