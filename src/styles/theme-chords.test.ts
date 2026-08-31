import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The theme-chord rules from the table in colors.scss, pinned.
 *
 * A theme is a chord of Radix scales — mono, accent, flash, zone,
 * warning, error — and the rules exist because all six can meet in
 * one tile grid:
 *
 *   1. Within a theme, every role uses a DIFFERENT scale.
 *   2. flash stays in the bright-warm family (amber / yellow) so the
 *      shared dark --flash-on-solid stays valid and gold stays gold.
 *   3. zone stays in the deep-cool family (teal / jade / cyan) so
 *      the shared white --success-on-solid stays valid.
 *   4. error is always red, warning always orange — danger is not a
 *      mood.
 *   5. Every scale a chord names is actually imported, light AND
 *      dark — a missing import fails silently as transparent tokens.
 *   6. There is NO bespoke cover surface: the hero's slab is
 *      accent-solid + accent-on-solid, the sent-tile treatment.
 *      Two cover-token systems (hardcoded hexes, then light-dark())
 *      were built and deleted; this guard keeps the third from
 *      appearing.
 */

const source = readFileSync(
  join(process.cwd(), "src/styles/theme/colors.scss"),
  "utf8",
);

/**
 * Radix hue families. Two scales from ONE family collapse into each
 * other for a red-green colour-blind reader, so a theme may never
 * spend two of its three tile roles on the same family.
 */
const FAMILY: Record<string, string> = {
  amber: "warm", yellow: "warm", gold: "warm", orange: "warm",
  lime: "green", grass: "green", green: "green", jade: "green", mint: "green",
  teal: "cool", cyan: "cool", sky: "cool", blue: "cool", indigo: "cool",
  violet: "purple", iris: "purple", purple: "purple", plum: "purple",
  pink: "pink", crimson: "pink", ruby: "pink", red: "pink", tomato: "pink",
};

/** Flash is the REWARD colour, zone the PROGRESS colour — the two
 *  meanings that must survive a theme switch. */
const FLASH_FAMILY = ["warm"];
const ZONE_FAMILY = ["green", "cool"];

/** Radix scales whose step 9 is LIGHT: they take dark ink, every
 *  other scale takes white. The app's defaults are dark ink on
 *  flash and white on zone, so a theme that inverts either must say
 *  so in its own block. */
const LIGHT_NINE = ["amber", "yellow", "lime", "mint", "sky"];

interface Chord {
  theme: string;
  mono: string;
  accent: string;
  zone: string;
  flash: string;
  warning: string;
  error: string;
  block: string;
}

function chords(): Chord[] {
  const out: Chord[] = [];
  const blockRe = /\[data-theme="([a-z]+)"\]\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(source)) !== null) {
    const [, theme, block] = m;
    const scale = (role: string): string => {
      const hit = block.match(new RegExp(`${role}-scale\\((\\w+)\\)`));
      if (!hit) throw new Error(`theme ${theme}: no ${role}-scale(...)`);
      return hit[1];
    };
    out.push({
      theme,
      mono: scale("mono"),
      accent: scale("accent"),
      zone: scale("zone"),
      flash: scale("flash"),
      warning: scale("warning"),
      error: scale("error"),
      block,
    });
  }
  return out;
}

const all = chords();

describe("theme chords", () => {
  it("finds all four themes", () => {
    expect(all.map((c) => c.theme).sort()).toEqual([
      "blue",
      "default",
      "pink",
      "violet",
    ]);
  });

  it.each(all)("$theme: six roles, six different scales", (c) => {
    const scales = [c.mono, c.accent, c.zone, c.flash, c.warning, c.error];
    expect(new Set(scales).size, scales.join(" / ")).toBe(scales.length);
  });

  it.each(all)("$theme: flash rewards, zone progresses", (c) => {
    expect(FLASH_FAMILY, `flash=${c.flash}`).toContain(FAMILY[c.flash]);
    expect(ZONE_FAMILY, `zone=${c.zone}`).toContain(FAMILY[c.zone]);
  });

  it.each(all)("$theme: three tile roles, three hue families", (c) => {
    // The rule that actually serves colour-blind readers: accent,
    // flash and zone share a grid, so no two may come from one
    // family — under deuteranopia they would read as one colour.
    const families = [c.accent, c.flash, c.zone].map((s) => FAMILY[s]);
    for (const [scale, family] of [[c.accent, families[0]], [c.flash, families[1]], [c.zone, families[2]]]) {
      expect(family, `no family recorded for ${scale}`).toBeTruthy();
    }
    expect(new Set(families).size, families.join(" / ")).toBe(3);
  });

  it.each(all)("$theme: ink on a solid follows the scale, not the role", (c) => {
    const flashLight = LIGHT_NINE.includes(c.flash);
    const zoneLight = LIGHT_NINE.includes(c.zone);
    // Defaults: dark ink on flash, white on zone. Anything else is
    // the theme's job to declare.
    if (!flashLight) {
      expect(c.block, `${c.flash} step 9 is dark — flash needs white ink`).toMatch(
        /--flash-on-solid:\s*#fff/,
      );
    }
    if (zoneLight) {
      expect(c.block, `${c.zone} step 9 is light — zone needs dark ink`).toMatch(
        /--success-on-solid:\s*#[0-9a-f]{6}/i,
      );
      expect(c.block).not.toMatch(/--success-on-solid:\s*#fff/);
    }
  });

  it.each(all)("$theme: danger is not a mood", (c) => {
    expect(c.error).toBe("red");
    expect(c.warning).toBe("orange");
  });

  it.each(all)("$theme: every named scale is imported, light and dark", (c) => {
    for (const scale of [c.mono, c.accent, c.zone, c.flash, c.warning, c.error]) {
      expect(source, `missing @use for ${scale}`).toContain(
        `@use "@radix-ui/colors/${scale}.css"`,
      );
      expect(source, `missing @use for ${scale}-dark`).toContain(
        `@use "@radix-ui/colors/${scale}-dark.css"`,
      );
    }
  });

  it("no bespoke cover surface exists — the hero slab is the tile treatment", () => {
    expect(source, "a --surface-inverse token grew back").not.toContain(
      "--surface-inverse",
    );
    expect(source, "light-dark() cover machinery grew back").not.toContain(
      "light-dark(",
    );
  });

  it("no two themes share a zone — the role that used to make them look alike", () => {
    const zones = all.map((c) => c.zone);
    expect(new Set(zones).size, zones.join(" / ")).toBe(zones.length);
  });

  it("every accent is unique — the accent IS the theme", () => {
    const accents = all.map((c) => c.accent);
    expect(new Set(accents).size, accents.join(" / ")).toBe(accents.length);
  });

  it("the default chord is the brand, locked", () => {
    const chork = all.find((c) => c.theme === "default")!;
    expect(chork).toMatchObject({
      mono: "olive",
      accent: "lime",
      flash: "amber",
      zone: "teal",
    });
  });
});
