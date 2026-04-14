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

export type ThemeName =
  | "default"
  | "slate"
  | "sand"
  | "gray"
  | "mauve"
  | "sage";

export interface ThemeMeta {
  id: ThemeName;
  label: string;
  hint: string;
  swatches: [string, string];
}

export const THEME_META: ThemeMeta[] = [
  {
    id: "default",
    label: "Chork",
    hint: "Olive · Lime",
    swatches: ["var(--olive-9)", "var(--lime-9)"],
  },
  {
    id: "slate",
    label: "Slate",
    hint: "Slate · Iris",
    swatches: ["var(--slate-9)", "var(--iris-9)"],
  },
  {
    id: "sand",
    label: "Sand",
    hint: "Sand · Tomato",
    swatches: ["var(--sand-9)", "var(--tomato-9)"],
  },
  {
    id: "gray",
    label: "Gray",
    hint: "Gray · Violet",
    swatches: ["var(--gray-9)", "var(--violet-9)"],
  },
  {
    id: "mauve",
    label: "Mauve",
    hint: "Mauve · Plum",
    swatches: ["var(--mauve-9)", "var(--plum-9)"],
  },
  {
    id: "sage",
    label: "Sage",
    hint: "Sage · Jade",
    swatches: ["var(--sage-9)", "var(--jade-9)"],
  },
];

export const STORAGE_KEY = "chork-theme";
export const DEFAULT_THEME: ThemeName = "default";

type Listener = () => void;
const listeners = new Set<Listener>();
let currentTheme: ThemeName = DEFAULT_THEME;

export function isValidTheme(t: string | null | undefined): t is ThemeName {
  return !!t && THEME_META.some((meta) => meta.id === t);
}

// Client-only bootstrap — runs once at module evaluation in the
// browser so the first `getSnapshot()` already reflects the stored
// value. On the server this branch is skipped entirely.
if (typeof window !== "undefined") {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValidTheme(stored)) currentTheme = stored;
  } catch {
    // Private browsing / storage disabled — stick with the default.
  }
}

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

export function setThemeStore(next: ThemeName): void {
  if (next === currentTheme) return;
  currentTheme = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Same tolerance as the read path.
  }
  listeners.forEach((fn) => fn());
}

/**
 * Bridge entry — fed by the auth profile once it loads. Updates the
 * local store to match the persisted preference WITHOUT firing the
 * server write-back that `setTheme()` does. Safe to call repeatedly
 * and with unknown / stale DB values (invalid inputs are ignored).
 */
export function syncThemeFromProfile(
  profileTheme: string | null | undefined,
): void {
  if (!isValidTheme(profileTheme)) return;
  if (profileTheme === currentTheme) return;
  currentTheme = profileTheme;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, currentTheme);
    }
  } catch {
    // ignore
  }
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
