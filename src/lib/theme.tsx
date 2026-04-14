"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * User-selectable theme palettes. Adding a new theme means:
 *   1. Add a `[data-theme="name"]` block in `src/styles/theme/colors.scss`.
 *   2. Add the id here.
 *   3. Add the entry in `THEME_META` so the settings picker renders it.
 *
 * Persistence: the climber's selection writes to `profiles.theme`
 * (migration 028) so it syncs across devices. localStorage is the
 * fast path that owns first paint; the auth profile rehydrates the
 * store once it loads and any divergence is reconciled there.
 *
 * TODO: when viewing another climber's profile (`/u/[username]`),
 * render the page in *their* chosen theme. The profile page server
 * component can read `profile.theme` and wrap its subtree in
 * `<div data-theme={profile.theme}>`; the viewer's own theme
 * restores when they leave the route.
 */
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
  /** Short hint rendered under the label in the picker. */
  hint: string;
  /** Two swatch colours for the picker — step-9 of mono / accent. */
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

const STORAGE_KEY = "chork-theme";
const DEFAULT_THEME: ThemeName = "default";

/*
 * Tiny external store. Lives outside React so the theme can be read
 * / written without going through an effect — `useSyncExternalStore`
 * handles SSR safely (falls back to `DEFAULT_THEME` on the server)
 * and re-subscribes browser-side for free. This sidesteps the
 * "setState in effect" lint error that the old useState +
 * useEffect-on-mount approach tripped.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let currentTheme: ThemeName = DEFAULT_THEME;

function isValidTheme(t: string | null): t is ThemeName {
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

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemeName {
  return currentTheme;
}

function getServerSnapshot(): ThemeName {
  return DEFAULT_THEME;
}

function setThemeStore(next: ThemeName): void {
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
 * Bridge entry — fed by the auth profile once it loads. Updates
 * the local store to match the persisted preference WITHOUT
 * firing the server write-back that `setTheme()` does (we just
 * read it from the DB, so writing back would be a no-op round
 * trip). Safe to call repeatedly.
 */
export function syncThemeFromProfile(profileTheme: string | null | undefined): void {
  if (!isValidTheme(profileTheme ?? null)) return;
  if (profileTheme === currentTheme) return;
  currentTheme = profileTheme as ThemeName;
  try {
    window.localStorage.setItem(STORAGE_KEY, currentTheme);
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn());
}

/**
 * Write the theme attribute to `<html>`. `default` clears the
 * attribute so the bare `:root` styles take over — no CSS selector
 * needs to match.
 */
function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (theme === DEFAULT_THEME) {
    el.removeAttribute("data-theme");
  } else {
    el.setAttribute("data-theme", theme);
  }
}

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { profile } = useAuth();

  // Bridge: when the auth profile resolves (or a theme change syncs
  // back from another device) push it into the local store so this
  // tab matches the persisted preference.
  useEffect(() => {
    syncThemeFromProfile(profile?.theme);
  }, [profile?.theme]);

  // Effect updates an external system (the DOM `<html>` attribute)
  // in response to the store's value.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Public setter — local store + DB persistence (fire-and-forget;
  // failures don't unwind the local change).
  const setTheme = useCallback((next: ThemeName) => {
    setThemeStore(next);
    if (!profile?.id) return;
    void (async () => {
      try {
        const { updateThemePreference } = await import("@/lib/user-actions");
        await updateThemePreference(next);
      } catch (err) {
        console.warn("[chork] theme persist failed:", err);
      }
    })();
  }, [profile?.id]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
