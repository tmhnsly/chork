#!/usr/bin/env node
// `pnpm db:verify` — does the database run the functions this repo says
// it runs?
//
// `supabase/definitions/` is generated from the migrations and pinned to
// them by a unit test, so it answers "what do the migrations leave
// standing". This script asks the other half: "is that what production
// has". The two can part company without anything failing. A migration
// applied from a branch that never merged did exactly that to
// `mark_all_notifications_read` (see migration 143): the database ran a
// body no migration on main described.
//
// Compares, for every function in `public`:
//   - the set of names (one the repo lacks, or one the database lacks)
//   - the body, whitespace-insensitively (`pg_proc.prosrc` against the
//     text between the dollar quotes)
//   - SECURITY DEFINER, since losing it silently changes who a function
//     runs as
//
// Read-only. Needs the Supabase CLI linked and signed in, the same as
// `npx supabase db push`, so it runs on a developer's machine after a
// push, not in CI.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFINITIONS = join(process.cwd(), "supabase", "definitions");

const QUERY = `
  select p.proname as name, p.prosrc as source, p.prosecdef as definer
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  order by 1;
`;

function liveFunctions() {
  // The output format is pinned, not left to the CLI. Its default is a
  // text table, and it switches to JSON by itself only when it detects
  // an agent (`--agent auto`): so this passed when an agent ran it and
  // failed in a terminal, parsing the table from the first `{` — which
  // was inside a function body's regex.
  const out = execFileSync(
    "npx",
    ["supabase", "db", "query", "--linked", "--output-format", "json", "--agent", "no", QUERY],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  // A bare array of rows today; agent mode wrapped them as `{ rows }`.
  // Anything else is a CLI change to look at, not something to guess at.
  const data = JSON.parse(out.trim());
  const rows = Array.isArray(data) ? data : data?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`db:verify: unexpected output from \`supabase db query\`: ${out.slice(0, 200)}`);
  }
  return rows;
}

function repoFunctions() {
  return readdirSync(DEFINITIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const text = readFileSync(join(DEFINITIONS, f), "utf8");
      const quote = text.match(/\bas\s+(\$[a-z_]*\$)/i);
      if (!quote) throw new Error(`${f}: no dollar-quoted body`);
      const start = quote.index + quote[0].length;
      const end = text.indexOf(quote[1], start);
      return {
        name: f.replace(/\.sql$/, ""),
        source: text.slice(start, end),
        definer: /security\s+definer/i.test(text.slice(0, quote.index)),
      };
    });
}

const squash = (sql) => sql.replace(/\s+/g, " ").trim();

const live = new Map(liveFunctions().map((f) => [f.name, f]));
const repo = new Map(repoFunctions().map((f) => [f.name, f]));
const problems = [];

for (const name of repo.keys()) {
  if (!live.has(name)) problems.push(`${name}: in supabase/definitions, not in the database`);
}
for (const [name, fn] of live) {
  const mine = repo.get(name);
  if (!mine) {
    problems.push(`${name}: in the database, not in supabase/definitions`);
    continue;
  }
  if (squash(fn.source) !== squash(mine.source)) {
    problems.push(`${name}: the database runs a different body`);
  }
  if (fn.definer !== mine.definer) {
    problems.push(
      `${name}: SECURITY DEFINER is ${fn.definer ? "on" : "off"} in the database, ${mine.definer ? "on" : "off"} here`,
    );
  }
}

if (problems.length > 0) {
  console.error(`${problems.length} function(s) differ between this repo and the linked database:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nA pending migration explains a difference (`npx supabase db push`). Anything else means\n" +
      "the database was changed outside this branch's migrations: write the migration that records it.",
  );
  process.exit(1);
}

console.log(`${live.size} functions: the linked database matches supabase/definitions.`);
