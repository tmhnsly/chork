import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AVATAR_SIZES } from "./avatar-sizes";

/**
 * The avatar scale lives in two places by necessity: `next/image`
 * needs real numbers for width/height, and SCSS needs custom
 * properties for the surfaces that size a circle without rendering a
 * <UserAvatar> (loading skeletons, the "+N" pill on a stack).
 *
 * Those surfaces exist to occupy the same space as a real avatar. If
 * the two definitions drift, the skeleton stops matching the header
 * it stands in for and the hand-off becomes a layout shift — which is
 * the exact bug the scale was introduced to stop. So: pin them.
 */
const SPACING = readFileSync(
  join(process.cwd(), "src/styles/theme/spacing.scss"),
  "utf8",
);

const REM_PX = 16;

function cssRung(name: string): number | null {
  const m = SPACING.match(
    new RegExp(`--size-avatar-${name}:\\s*([0-9.]+)rem`),
  );
  return m ? Number(m[1]) * REM_PX : null;
}

describe("avatar scale", () => {
  it("defines a CSS token for every TS rung, at the same pixel value", () => {
    for (const [name, px] of Object.entries(AVATAR_SIZES)) {
      expect(cssRung(name), `--size-avatar-${name} missing from spacing.scss`)
        .not.toBeNull();
      expect(cssRung(name), `--size-avatar-${name} disagrees with AVATAR_SIZES.${name}`)
        .toBe(px);
    }
  });

  it("defines no CSS avatar token that TS does not know about", () => {
    const declared = [...SPACING.matchAll(/--size-avatar-([A-Za-z]+):/g)].map(
      (m) => m[1],
    );
    for (const name of declared) {
      expect(
        Object.keys(AVATAR_SIZES),
        `--size-avatar-${name} has no matching AVATAR_SIZES rung`,
      ).toContain(name);
    }
  });

  it("keeps the stack overlap smaller than the stack avatar", () => {
    // An overlap at or past the avatar's own width would stack the
    // circles on top of each other instead of fanning them.
    const m = SPACING.match(/--avatar-stack-overlap:\s*([0-9.]+)rem/);
    expect(m).not.toBeNull();
    expect(Number(m![1]) * REM_PX).toBeLessThan(AVATAR_SIZES.stack);
  });
});
