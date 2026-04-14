/**
 * Theme store — pins the contract that:
 *   • `syncThemeFromProfile` ignores invalid / unknown values
 *     (we never want to render an unknown theme name on `<html>`);
 *   • `isValidTheme` is a strict subset check;
 *   • `THEME_META` is non-empty and every entry has both swatches;
 *   • IDs in `THEME_META` match the `ThemeName` union (catches drift
 *     between the settings picker and the union).
 */
import { describe, it, expect } from "vitest";
import {
  THEME_META,
  DEFAULT_THEME,
  isValidTheme,
  syncThemeFromProfile,
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
