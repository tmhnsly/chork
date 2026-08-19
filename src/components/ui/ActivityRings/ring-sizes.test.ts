import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RING_SIZES } from "./ring-sizes";

/**
 * The ring scale lives in two places by necessity, like the avatar
 * scale: `<ActivityRings>` needs a real number to compute stroke and
 * radii, and SCSS needs a custom property for the one surface that
 * sizes a ring in CSS — the stats row, which lets its `card` ring give
 * way toward `compact` when a narrow phone cannot fit the row.
 *
 * If the two drift, the CSS floor stops being a rung and the row's
 * smallest ring is a size that exists nowhere else. So: pin them.
 */
const SPACING = readFileSync(
  join(process.cwd(), "src/styles/theme/spacing.scss"),
  "utf8",
);

const REM_PX = 16;

function cssRung(name: string): number | null {
  const m = SPACING.match(new RegExp(`--size-ring-${name}:\\s*([0-9.]+)rem`));
  return m ? Number(m[1]) * REM_PX : null;
}

describe("ring scale", () => {
  it("defines a CSS token for every TS rung, at the same pixel value", () => {
    for (const [name, px] of Object.entries(RING_SIZES)) {
      expect(cssRung(name), `--size-ring-${name} missing from spacing.scss`).not.toBeNull();
      expect(cssRung(name), `--size-ring-${name} disagrees with RING_SIZES.${name}`).toBe(px);
    }
  });

  it("has no CSS rung the TS scale doesn't know", () => {
    const inCss = [...SPACING.matchAll(/--size-ring-([a-zA-Z]+):/g)].map((m) => m[1]);
    for (const name of inCss) {
      expect(name in RING_SIZES, `--size-ring-${name} has no RING_SIZES entry`).toBe(true);
    }
  });
});
