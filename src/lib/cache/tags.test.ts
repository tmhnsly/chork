import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { tags } from "./tags";

/**
 * Cache-tag hygiene — the reader-first rule from tags.ts, pinned.
 *
 * A tag that is only ever busted is a no-op that *reads* like cache
 * correctness: the mutation looks covered, reviewers assume the
 * invalidation works, and nobody notices there is no cached entry to
 * invalidate. A 2026-08 audit found six such tags (userStats,
 * userCrews, userProfile, crew, userNotifications, userJams) plus a
 * live per-mutation DB round-trip whose only job was fanning out
 * no-op busts.
 *
 * Rules, one test each:
 *   1. Every tag constructor is registered on at least one
 *      `cachedQuery({ tags: [...] })` reader (a use on a line that
 *      is not a `revalidateTag` call).
 *   2. Every constructor is actually used somewhere — no aspirational
 *      entries "reserved for later".
 *
 * A bust with no reader is NOT enforced-the-other-way: a registered
 * tag with no buster can be legitimate (TTL-only refresh), so only
 * the write-only direction fails.
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

const sourceFiles = walk(SRC)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
  .filter((f) => !f.endsWith(join("lib", "cache", "tags.ts")))
  .map((f) => ({
    path: relative(SRC, f),
    lines: readFileSync(f, "utf8").split("\n"),
  }));

const tagNames = Object.keys(tags) as (keyof typeof tags)[];

interface Use {
  path: string;
  line: string;
}

function usesOf(name: string): { registrations: Use[]; busts: Use[] } {
  const registrations: Use[] = [];
  const busts: Use[] = [];
  const re = new RegExp(`\\btags\\.${name}\\(`);
  for (const file of sourceFiles) {
    for (const line of file.lines) {
      if (!re.test(line)) continue;
      const use = { path: file.path, line: line.trim() };
      if (line.includes("revalidateTag")) busts.push(use);
      else registrations.push(use);
    }
  }
  return { registrations, busts };
}

describe("cache tag hygiene (reader-first rule)", () => {
  it.each(tagNames)(
    "tags.%s has at least one cachedQuery registration",
    (name) => {
      const { registrations, busts } = usesOf(name);
      expect(
        registrations.length,
        `tags.${name} is ${
          busts.length > 0
            ? `busted at ${busts.length} site(s) but registered on no cached read — the busts are no-ops`
            : "never registered on a cached read"
        }. Either add the cachedQuery({ tags: [...] }) reader this tag anticipates, or delete the constructor until one exists (reader-first rule, tags.ts).`,
      ).toBeGreaterThan(0);
    },
  );

  it("has no unused constructors", () => {
    const unused = tagNames.filter((name) => {
      const { registrations, busts } = usesOf(name);
      return registrations.length === 0 && busts.length === 0;
    });
    expect(
      unused,
      "Aspirational tag constructors drift out of date before their reader arrives — add the constructor in the same change as its cachedQuery reader.",
    ).toEqual([]);
  });
});
