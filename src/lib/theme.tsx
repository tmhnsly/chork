"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

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

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default theme is the bare `:root` block, so first paint is
  // correct even before the effect runs and the localStorage value
  // takes over. No flash-of-wrong-theme.
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
    if (stored && THEME_META.some((t) => t.id === stored)) {
      setThemeState(stored);
      applyTheme(stored);
    }
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / disabled storage — theme still applies for
      // the session, we just can't persist it.
    }
  }, []);

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

/**
 * Write the theme attribute to `<html>`. `default` clears the
 * attribute so the bare `:root` styles take over — no CSS selector
 * needs to match.
 */
function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (theme === DEFAULT_THEME) {
    el.removeAttribute("data-theme");
  } else {
    el.setAttribute("data-theme", theme);
  }
}
