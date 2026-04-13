"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

/**
 * User-selectable theme palettes. Adding a new theme means:
 *   1. Add a `[data-theme="name"]` block in `src/styles/theme/colors.scss`.
 *   2. Add the id here.
 *   3. Add the entry in `THEME_META` so the settings picker renders it.
 *
 * TODO: persist the selection on the user profile so it syncs across
 * devices. Right now the choice is per-tab only — restored from
 * `localStorage` on mount, with no DB column.
 *
 * TODO: when viewing another climber's profile (`/u/[username]`),
 * render the page in *their* chosen theme. Once the column exists,
 * the profile page server component can read `profile.theme` and
 * wrap its subtree in `<div data-theme={profile.theme}>` (or push it
 * onto `<html>` for the duration of the route). The viewer's own
 * theme should restore when they leave the profile page.
 */
export type ThemeName = "default" | "slate" | "sand";

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

  // Effect updates an external system (the DOM `<html>` attribute)
  // in response to the store's value — allowed by `set-state-in-effect`
  // because we're not calling `setState` here, just syncing React's
  // view to the document.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeStore }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
