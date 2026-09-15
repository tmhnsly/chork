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
 *     signing out can't leave your palette on a shared phone;
 *   • the server paints the palette from the palette cookie, and the
 *     browser store leaves that paint alone until the profile settles,
 *     repainting and re-remembering only on a real change.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  THEME_META,
  DEFAULT_THEME,
  isValidTheme,
  syncThemeFromProfile,
  setThemeStore,
  subscribe,
  getSnapshot,
  type ThemeName,
} from "./theme-store";
import { PALETTE_COOKIE, htmlThemeAttribute, themeFromCookie } from "./theme-palettes";

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

describe("the palette cookie", () => {
  it("names one of the four palettes, or the default", () => {
    for (const name of KNOWN_THEMES) expect(themeFromCookie(name)).toBe(name);
    expect(themeFromCookie(undefined)).toBe(DEFAULT_THEME);
    expect(themeFromCookie("")).toBe(DEFAULT_THEME);
    // A forged cookie can't put anything else onto <html>.
    expect(themeFromCookie('blue" onload="x')).toBe(DEFAULT_THEME);
  });

  it("puts no data-theme on <html> for the default, so bare :root applies", () => {
    expect(htmlThemeAttribute(DEFAULT_THEME)).toBeUndefined();
    expect(htmlThemeAttribute("blue")).toBe("blue");
  });

  it("is what the root layout paints <html> from", () => {
    // Found at Yonder: every reload painted Chork lime first and swapped
    // to the climber's palette after hydration. The server paints it now.
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/themeFromCookie\(/);
    expect(layout).toMatch(/data-theme=\{htmlThemeAttribute\(/);
  });

  it("is never overridden by ThemeProvider painting a render value", () => {
    // The old provider painted `theme` from an effect, which ran on mount
    // with the hydration value, before the profile had settled.
    const provider = readFileSync(join(process.cwd(), "src/lib/theme.tsx"), "utf8");
    expect(provider).not.toMatch(/\bapplyTheme\b/);
  });
});

describe("painting the palette in the browser", () => {
  function fakeDocument(painted: string | null, cookie = "") {
    const attrs = new Map<string, string>();
    if (painted) attrs.set("data-theme", painted);
    const writes: string[] = [];
    const root = {
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: vi.fn((name: string, value: string) => void attrs.set(name, value)),
      removeAttribute: vi.fn((name: string) => void attrs.delete(name)),
    };
    const doc = {
      documentElement: root,
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        writes.push(value);
      },
    };
    return { doc, attrs, root, writes };
  }

  /** A fresh store, loaded on a page the server painted. */
  async function storeOn(doc: unknown) {
    vi.resetModules();
    vi.stubGlobal("document", doc);
    return import("./theme-store");
  }

  const last = (writes: string[]) => writes[writes.length - 1] ?? "";

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("adopts the palette the server painted", async () => {
    const { doc } = fakeDocument("blue", `${PALETTE_COOKIE}=blue`);
    const store = await storeOn(doc);
    expect(store.getSnapshot()).toBe("blue");
  });

  it("leaves the server's paint alone until the profile settles", async () => {
    const { doc, root, writes } = fakeDocument("blue", `${PALETTE_COOKIE}=blue`);
    await storeOn(doc);
    expect(root.setAttribute).not.toHaveBeenCalled();
    expect(root.removeAttribute).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("doesn't repaint when the server already painted the profile's palette", async () => {
    const { doc, root } = fakeDocument("blue", `${PALETTE_COOKIE}=blue`);
    const store = await storeOn(doc);
    store.syncThemeFromProfile("blue");
    expect(root.setAttribute).not.toHaveBeenCalled();
    expect(root.removeAttribute).not.toHaveBeenCalled();
  });

  it("paints and remembers the profile's palette when the server couldn't", async () => {
    // The first page after signing in on a device: no cookie yet.
    const { doc, attrs, writes } = fakeDocument(null);
    const store = await storeOn(doc);
    store.syncThemeFromProfile("violet");
    expect(attrs.get("data-theme")).toBe("violet");
    expect(last(writes)).toMatch(new RegExp(`^${PALETTE_COOKIE}=violet;.*max-age=31536000`));
  });

  it("clears the painted palette and forgets it when the profile goes away", async () => {
    const { doc, attrs, writes } = fakeDocument("blue", `${PALETTE_COOKIE}=blue`);
    const store = await storeOn(doc);
    store.syncThemeFromProfile(undefined);
    expect(attrs.has("data-theme")).toBe(false);
    expect(last(writes)).toMatch(new RegExp(`^${PALETTE_COOKIE}=;.*max-age=0`));
  });

  it("writes nothing for a signed-out visitor with no cookie", async () => {
    const { doc, writes } = fakeDocument(null);
    const store = await storeOn(doc);
    store.syncThemeFromProfile(undefined);
    expect(writes).toEqual([]);
  });

  it("paints and remembers a palette the climber picks", async () => {
    const { doc, attrs, writes } = fakeDocument(null);
    const store = await storeOn(doc);
    store.setThemeStore("pink");
    expect(attrs.get("data-theme")).toBe("pink");
    expect(last(writes)).toMatch(new RegExp(`^${PALETTE_COOKIE}=pink;`));
  });
});

