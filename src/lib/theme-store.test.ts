/**
 * Theme store — pins the contract that:
 *   • `syncThemeFromProfile` ignores invalid / unknown values
 *     (we never want to render an unknown theme name on `<html>`);
 *   • `isValidTheme` is a strict subset check;
 *   • `THEME_META` is non-empty and every entry has both swatches;
 *   • IDs in `THEME_META` match the `ThemeName` union (catches drift
 *     between the settings picker and the union);
 *   • `resetTheme` clears both the in-memory value and the stored
 *     one, so signing out can't leave your palette on a shared phone.
 */
import { describe, it, expect, vi } from "vitest";
import {
  THEME_META,
  DEFAULT_THEME,
  STORAGE_KEY,
  isValidTheme,
  syncThemeFromProfile,
  resetTheme,
  setThemeStore,
  subscribe,
  getSnapshot,
  getServerSnapshot,
  type ThemeName,
} from "./theme-store";

const KNOWN_THEMES: ThemeName[] = ["default", "slate", "sand", "gray", "mauve", "sage"];

describe("THEME_META", () => {
  it("includes the default theme", () => {
    expect(THEME_META.length).toBeGreaterThan(0);
    expect(THEME_META.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });

  it("every entry carries two non-empty swatches", () => {
    for (const meta of THEME_META) {
      expect(meta.swatches).toHaveLength(2);
      for (const s of meta.swatches) {
        expect(typeof s).toBe("string");
        expect(s.length).toBeGreaterThan(0);
      }
    }
  });

  it("every meta id is in the ThemeName union (no drift)", () => {
    for (const meta of THEME_META) {
      expect(KNOWN_THEMES).toContain(meta.id);
    }
  });
});

describe("isValidTheme", () => {
  it("accepts every known theme", () => {
    for (const name of KNOWN_THEMES) expect(isValidTheme(name)).toBe(true);
  });

  it("rejects unknown / empty / nullish values", () => {
    expect(isValidTheme("not-a-real-theme")).toBe(false);
    expect(isValidTheme("")).toBe(false);
    expect(isValidTheme(null)).toBe(false);
    expect(isValidTheme(undefined)).toBe(false);
  });
});

describe("syncThemeFromProfile", () => {
  it("does not throw on null / undefined", () => {
    expect(() => syncThemeFromProfile(null)).not.toThrow();
    expect(() => syncThemeFromProfile(undefined)).not.toThrow();
  });

  it("ignores unknown theme strings (defends against stale DB rows)", () => {
    const before = getSnapshot();
    syncThemeFromProfile("not-a-real-theme");
    syncThemeFromProfile("");
    expect(getSnapshot()).toBe(before);
  });

  it("accepts every known theme without throwing", () => {
    for (const name of KNOWN_THEMES) {
      expect(() => syncThemeFromProfile(name)).not.toThrow();
    }
  });
});

describe("getServerSnapshot", () => {
  it("always returns the default (SSR safety)", () => {
    expect(getServerSnapshot()).toBe(DEFAULT_THEME);
  });
});

describe("resetTheme", () => {
  // The theme belongs to the climber, not the device. These pin the
  // shared-phone case: sign out, hand the phone over, and the next
  // person must not be looking at your palette.
  const nonDefault = THEME_META.find((m) => m.id !== DEFAULT_THEME)!.id;

  it("drops back to the default palette", () => {
    setThemeStore(nonDefault);
    expect(getSnapshot()).toBe(nonDefault);
    resetTheme();
    expect(getSnapshot()).toBe(DEFAULT_THEME);
  });

  it("forgets the stored preference so it can't come back on reload", () => {
    // The module reads localStorage on load, so clearing the in-memory
    // value alone would let the old theme reappear on the next visit.
    //
    // The unit project runs in node, and the store wraps every storage
    // call in try/catch — so without a stub this assertion would pass
    // vacuously against a ReferenceError that never surfaced.
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });

    try {
      setThemeStore(nonDefault);
      expect(store.get(STORAGE_KEY)).toBe(nonDefault);
      resetTheme();
      expect(store.has(STORAGE_KEY)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("is safe to call when already on the default", () => {
    resetTheme();
    expect(() => resetTheme()).not.toThrow();
    expect(getSnapshot()).toBe(DEFAULT_THEME);
  });

  it("notifies subscribers so the UI repaints", () => {
    // Without this the `<html data-theme>` attribute keeps the old
    // palette until something else happens to re-render.
    setThemeStore(nonDefault);
    let calls = 0;
    const unsubscribe = subscribe(() => {
      calls += 1;
    });
    resetTheme();
    unsubscribe();
    expect(calls).toBe(1);
  });
});
