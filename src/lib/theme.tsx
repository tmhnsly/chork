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
        logger.warn("theme_persist_failed", { err: formatErrorForLog(err) });
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
