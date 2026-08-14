import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Read the LIVE definition of a Postgres function out of the
 * migration set.
 *
 * Migrations are `create or replace`, so the definition Postgres
 * actually runs is the LAST one in filename order — not the first,
 * and not the one whose filename mentions the feature. Tests that
 * pin SQL behaviour must resolve that the same way or they pin a
 * superseded body and pass while production drifts.
 *
 * Two consumers today (`scoring-parity.test.ts`,
 * `attempt-privacy.test.ts`), which is what makes this a shared seam
 * rather than a helper worth inlining. Anything else that needs to
 * assert on SQL should come through here.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

export interface SqlDefinition {
  /** Migration filename the live definition came from. */
  file: string;
  /** Function body, from `create or replace` through the closing `$$;`. */
  body: string;
}

/** Live definition of `name`, or throw if no migration defines it. */
export function latestDefinition(name: string): SqlDefinition {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const startRe = new RegExp(
    `create or replace function (?:public\\.)?${name}\\s*\\(`,
    "g",
  );
  let found: SqlDefinition | null = null;
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS, file), "utf8");
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(text)) !== null) {
      const end = text.indexOf("$$;", m.index);
      found = {
        file,
        body: text.slice(m.index, end === -1 ? undefined : end + 3),
      };
    }
    startRe.lastIndex = 0;
  }
  if (!found) throw new Error(`No migration defines ${name}`);
  return found;
}

/**
 * Normalise a SQL fragment for comparison: collapse whitespace and
 * strip table aliases (`a.points` → `points`) so a cosmetic rename or
 * re-indent doesn't fail a behavioural assertion.
 */
export function normaliseClause(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\b\w+\.(\w+)/g, "$1")
    .trim();
}
