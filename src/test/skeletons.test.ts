import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Loading skeletons stay true to the views they stand in for.
 *
 * Two rules, both mechanical, both learned the hard way after a day
 * of visual work left every route skeleton describing the page it
 * used to be:
 *
 *   1. A component's skeleton shares the component's stylesheet. A
 *      skeleton that measures by hand (a `CardSkeleton` with a guessed
 *      height) is right at one width on the day it is written.
 *   2. A route's `loading.tsx` reserves a subtitle line exactly when
 *      the route's page passes one — otherwise the header changes
 *      height on hand-off and the whole page slides.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const ALL = walk(SRC);

/** Generic primitives that ARE the stylesheet for what they draw. */
const PRIMITIVES = new Set([
  "components/ui/CardSkeleton.tsx",
  "components/ui/PageHeaderSkeleton.tsx",
]);

describe("stylesheet imports", () => {
  it("every relative .module.scss import points at a file that exists", () => {
    // Typecheck can't see this — SCSS modules are typed as `any` —
    // and a route skeleton once imported a sibling stylesheet that
    // wasn't there. The dev overlay caught it; CI should first.
    const bad: string[] = [];
    for (const file of ALL) {
      if (!/\.tsx?$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/from "(\.\.?\/[^"]+\.module\.scss)"/g)) {
        if (!existsSync(join(dirname(file), m[1]))) bad.push(`${relative(SRC, file)} → ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("skeletons", () => {
  it("a component's skeleton imports a stylesheet from its own folder", () => {
    const bad: string[] = [];
    for (const file of ALL) {
      const rel = relative(SRC, file);
      if (!/Skeleton\.tsx$|\.skeleton\.tsx$/.test(rel)) continue;
      if (PRIMITIVES.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      // Its own folder's module; or it composes other skeletons (a
      // route-level stand-in); or it is built from the component's
      // real parts (StatsWidgetSkeleton renders the real ring row and
      // chart with empty data — the strongest form there is).
      const ownStyles = /from "\.\/[\w.-]+\.module\.scss"/.test(text);
      const composes = /Skeleton\b/.test(text.replace(/export function \w+Skeleton/, ""));
      const realParts = /from "@\/components\/(?!ui"|ui\/(?:Shimmer|CardSkeleton|PageHeaderSkeleton)")[\w/.-]+"/.test(text);
      if (!ownStyles && !composes && !realParts) bad.push(rel);
    }
    expect(
      bad,
      "A skeleton measures by sharing its component's stylesheet, not by " +
        "guessing a height. Import ./<component>.module.scss and lay out " +
        "the same boxes with shimmerStyles.skeletonLine / skeletonDisc, " +
        "or render the component's real parts with empty data.",
    ).toEqual([]);
  });

  it("a route's loading.tsx reserves a subtitle exactly when its page has one", () => {
    const bad: string[] = [];
    for (const file of ALL) {
      if (basename(file) !== "loading.tsx") continue;
      const page = join(dirname(file), "page.tsx");
      if (!existsSync(page)) continue;
      const loading = readFileSync(file, "utf8");
      if (!loading.includes("PageHeaderSkeleton")) continue;
      const pageHasSubtitle = /<PageHeader[\s\S]*?subtitle=/.test(readFileSync(page, "utf8"));
      const skeletonHasSubtitle = /<PageHeaderSkeleton[^>]*\bsubtitle\b/.test(loading);
      if (pageHasSubtitle !== skeletonHasSubtitle) {
        bad.push(
          `${relative(SRC, file)}: page ${pageHasSubtitle ? "has" : "has no"} subtitle, ` +
            `skeleton ${skeletonHasSubtitle ? "reserves one" : "reserves none"}`,
        );
      }
    }
    expect(bad).toEqual([]);
  });
});
