import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Page titles, checked by grep.
 *
 * The root layout sets `title.template = "%s · Chork"`, so every page
 * that also spelled out its own "- Chork" rendered twice: the share
 * card's tab read "Portland Saturday - Chork · Chork", and so did the
 * unfurl in whatever chat it was pasted into. 25 pages had it — the
 * kind of thing nobody notices in review and everybody notices in a
 * screenshot.
 *
 * A test rather than a fixed commit because the mistake is the natural
 * one to make: writing a title, you think about what the tab should
 * say, not about what a layout three levels up is going to append.
 */

const APP = join(process.cwd(), "src/app");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("page metadata", () => {
  it("never repeats the site name the layout template already adds", () => {
    // `layout.tsx` owns the template and is the one file allowed to
    // name the site.
    const offenders = tsxFiles(APP)
      .filter((f) => !f.endsWith(join("src/app", "layout.tsx")))
      .flatMap((file) => {
        const src = readFileSync(file, "utf8");
        return src
          .split("\n")
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) =>
            /title:\s*(?:`|"|')[^`"']*[-–·|]\s*Chork/.test(line),
          )
          .map(({ line, n }) => `${file.replace(process.cwd() + "/", "")}:${n} ${line.trim()}`);
      });

    expect(
      offenders,
      "Drop the site name — src/app/layout.tsx appends '· Chork' to every title",
    ).toEqual([]);
  });

  it("still has a template to rely on", () => {
    // The rule above is only safe while the template exists. If someone
    // removes it, every page silently loses the site name instead —
    // so pin the thing the other test depends on.
    const layout = readFileSync(join(APP, "layout.tsx"), "utf8");
    expect(layout).toMatch(/template:\s*"%s · Chork"/);
  });
});
