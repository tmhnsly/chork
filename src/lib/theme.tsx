"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  applyTheme,
  getServerSnapshot,
  getSnapshot,
  setThemeStore,
  subscribe,
  syncThemeFromProfile,
  type ThemeName,
} from "@/lib/theme-store";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
export { THEME_META, syncThemeFromProfile } from "@/lib/theme-store";
export type { ThemeName, ThemeMeta } from "@/lib/theme-store";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { profile, isLoading, refreshProfile } = useAuth();

  // The signed-in profile is the only input. No profile — signed out,
  // or a stale value in the column — means the default palette, so
  // there's no separate sign-out reset to remember to call.
  //
  // Gated on `isLoading` because a pre-bootstrap profile is
  // legitimately null for a signed-IN climber too; acting on that null
  // would flash the default palette on every page load before snapping
  // back. Once auth settles, null means signed out and nothing else.
  useEffect(() => {
    if (isLoading) return;
    syncThemeFromProfile(profile?.theme);
  }, [profile?.theme, isLoading]);

  // Effect updates an external system (the DOM `<html>` attribute)
  // in response to the store's value.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Public setter — paint locally at once, then persist.
  //
  // `refreshProfile()` is not optional now that the profile is the
  // source of truth. `updateThemePreference` writes the column and
  // revalidates the *server* caches, but leaves the client profile
  // (and the localStorage copy behind it) holding the old value — so
  // the next load would read the stale theme back out and undo the
  // change until the background validation caught up. Pulling the
  // profile forward keeps the one source coherent.
  //
  // Persistence stays fire-and-forget: a failed write leaves the
  // palette applied for this session and corrects itself on the next
  // load, which beats yanking the theme back out from under a tap.
  const setTheme = useCallback((next: ThemeName) => {
    setThemeStore(next);
    if (!profile?.id) return;
    void (async () => {
      try {
        const { updateThemePreference } = await import("@/app/profile/actions");
        await updateThemePreference(next);
        await refreshProfile();
      } catch (err) {
        logger.warn("theme_persist_failed", { err: formatErrorForLog(err) });
      }
    })();
  }, [profile?.id, refreshProfile]);

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
