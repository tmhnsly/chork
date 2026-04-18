#!/usr/bin/env node
// Next 16 migration: revalidateTag(tag) → revalidateTag(tag, 'max').
// The second arg became required. 'max' matches our existing
// mutation-then-read semantics (purge + next read sees fresh).

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SRC = join(ROOT, "src");

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

let changed = 0;
const files = [...walk(SRC)];
for (const file of files) {
  let src = readFileSync(file, "utf-8");
  const before = src;

  // Match `revalidateTag(expr)` where expr has no comma outside of
  // balanced parens. Since our call sites are always
  // revalidateTag(tags.X(id)) or revalidateTag(`literal`), this
  // regex suffices. It would NOT match revalidateTag(tag, profile)
  // that's already migrated.
  src = src.replace(
    /revalidateTag\(([^,;\n]*?\([^)]*\)|[^,();\n]*)\)(?!\s*,)/g,
    (match, expr) => `revalidateTag(${expr}, "max")`,
  );

  if (src === before) continue;
  writeFileSync(file, src);
  changed++;
  console.log(`  updated ${file.replace(ROOT + "/", "")}`);
}

console.log(`Done. ${changed} files updated.`);
