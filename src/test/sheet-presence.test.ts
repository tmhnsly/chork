import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A held sheet mounts fresh for every open.
 *
 * `useSheetPresence` keeps a closing sheet's content alive, so after the
 * first open the sheet element stays mounted. Anything a sheet seeds at
 * mount outlives the selection: the Card's route sheet seeded a reducer
 * and a log-id ref from the first tile's log, so every tile after that
 * wrote to the first route. The hook returns an open key that changes
 * each time a sheet opens from closed; any element handed the held
 * value must wear that key.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Every JSX opening tag, read to its closing `>` at brace depth zero. */
function openingTags(text: string): string[] {
  const tags: string[] = [];
  for (let i = text.indexOf("<"); i !== -1; i = text.indexOf("<", i + 1)) {
    if (!/[A-Z]/.test(text[i + 1] ?? "")) continue;
    let depth = 0;
    for (let j = i + 1; j < text.length; j++) {
      const c = text[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        tags.push(text.slice(i, j + 1));
        break;
      }
    }
  }
  return tags;
}

describe("held sheets", () => {
  it("every element given a held value wears the open key", () => {
    const bad: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("useSheetPresence(")) continue;
      const rel = relative(SRC, file);
      const calls = [...text.matchAll(/(const|let)\s+([^=]+?)=\s*useSheetPresence\(/g)];
      for (const call of calls) {
        const tuple = call[2].trim().match(/^\[\s*(\w+)\s*(?:,\s*(\w+)\s*)?\]$/);
        if (!tuple) {
          bad.push(`${rel}: destructure useSheetPresence as [held, openKey], got \`${call[2].trim()}\``);
          continue;
        }
        const [, held, openKey] = tuple;
        for (const tag of openingTags(text)) {
          if (!new RegExp(`=\\{\\s*${held}\\s*\\}`).test(tag)) continue;
          const name = tag.match(/^<([\w.]+)/)?.[1] ?? "?";
          if (!openKey || !new RegExp(`\\bkey=\\{\\s*${openKey}\\s*\\}`).test(tag)) {
            bad.push(`${rel}: <${name}> is handed {${held}} but not key={openKey}`);
          }
        }
      }
    }
    expect(
      bad,
      "A held sheet stays mounted after its first open, so it must be keyed by " +
        "the open key from useSheetPresence — otherwise the next open inherits " +
        "the last one's state.",
    ).toEqual([]);
  });
});
