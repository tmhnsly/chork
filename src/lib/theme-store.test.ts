/**
 * Theme store — pins the contract that:
 *   • `syncThemeFromProfile` never renders an unknown theme name on
 *     `<html>` — anything invalid resolves to the default;
 *   • `isValidTheme` is a strict subset check;
 *   • `THEME_META` and `colors.scss` declare the same palettes, in
 *     both directions;
 *   • IDs in `THEME_META` match the `ThemeName` union (catches drift
 *     between the settings picker and the union);
 *   • an absent / invalid profile theme resolves to the default, so
 *     signing out can't leave your palette on a shared phone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  THEME_META,
  DEFAULT_THEME,
  isValidTheme,
  syncThemeFromProfile,
  setThemeStore,
  subscribe,
  getSnapshot,
  getServerSnapshot,
  type ThemeName,
} from "./theme-store";

const KNOWN_THEMES: ThemeName[] = ["default", "blue", "violet", "pink"];

describe("THEME_META", () => {
  it("includes the default theme", () => {
    expect(THEME_META.length).toBeGreaterThan(0);
    expect(THEME_META.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });

  it("every theme has a matching block in colors.scss", () => {
    // The union, the picker and the stylesheet have to agree. A theme
    // in `THEME_META` with no CSS behind it renders as the palette of
    // whatever it inherits from — silently, and only for the climbers
    // who picked it. Cheaper to fail here than to hear about it.
    const css = readFileSync(
      join(process.cwd(), "src/styles/theme/colors.scss"),
      "utf8",
    );
    for (const meta of THEME_META) {
      expect(css, `no [data-theme="${meta.id}"] block in colors.scss`)
        .toContain(`[data-theme="${meta.id}"]`);
    }
  });

  it("declares no palette the union doesn't know about", () => {
    // The other direction: an orphaned block is dead CSS shipped to
    // every page, and usually the leftover of a rename.
    const css = readFileSync(
      join(process.cwd(), "src/styles/theme/colors.scss"),
      "utf8",
    );
    // Anchored to column 0 so it matches selectors only — the file's
    // own docblock mentions `[data-theme="<name>"]` when explaining
    // how to add a theme, and that is not a declaration.
    const declared = [...css.matchAll(/^\[data-theme="([^"]+)"\]/gm)].map(
      (m) => m[1],
    );
    expect(declared.length).toBeGreaterThan(0);
    for (const name of new Set(declared)) {
      expect(KNOWN_THEMES).toContain(name as ThemeName);
    }
  });

  it("gives every theme a label and a hint", () => {
    for (const meta of THEME_META) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.hint.length).toBeGreaterThan(0);
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
  const nonDefault = THEME_META.find((m) => m.id !== DEFAULT_THEME)!.id;

  it("does not throw on null / undefined", () => {
    expect(() => syncThemeFromProfile(null)).not.toThrow();
    expect(() => syncThemeFromProfile(undefined)).not.toThrow();
  });

  it("falls back to the default for unknown theme strings", () => {
    // Defends against a stale or hand-edited DB value: an unknown
    // name must not leave the previous palette in place.
    setThemeStore(nonDefault);
    syncThemeFromProfile("not-a-real-theme");
    expect(getSnapshot()).toBe(DEFAULT_THEME);
  });

  it("returns to the default when there is no profile (sign-out)", () => {
    // This IS the sign-out reset. The theme belongs to the climber, so
    // the profile going away is what restores the default — there is
    // no separate reset call that a new sign-out path could forget.
    // Pins the shared-phone case: sign out, hand the phone over, and
    // the next person must not be looking at your palette.
    setThemeStore(nonDefault);
    expect(getSnapshot()).toBe(nonDefault);
    syncThemeFromProfile(undefined);
    expect(getSnapshot()).toBe(DEFAULT_THEME);
  });

  it("notifies subscribers so the palette actually repaints", () => {
    setThemeStore(nonDefault);
    let calls = 0;
    const unsubscribe = subscribe(() => { calls += 1; });
    syncThemeFromProfile(undefined);
    unsubscribe();
    expect(calls).toBe(1);
  });

  it("is a no-op when the theme is already correct", () => {
    syncThemeFromProfile(undefined);
    let calls = 0;
    const unsubscribe = subscribe(() => { calls += 1; });
    syncThemeFromProfile(undefined);
    unsubscribe();
    expect(calls).toBe(0);
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

