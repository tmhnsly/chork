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
 * This is the one parser of the migration set. `sql-definitions.test.ts`
 * writes what it finds to `supabase/definitions/`, one file per live
 * function, so the current body of a function has a single home a
 * person can open; everything that asserts on SQL (`scoring-parity`,
 * `attempt-privacy`, `bundle-shape`, …) comes through here.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

export interface SqlDefinition {
  /** Function name, unqualified and lower-cased. */
  name: string;
  /** Migration filename the live definition came from. */
  file: string;
  /** The whole statement, from `create` through the closing `$tag$;`. */
  body: string;
  /**
   * The text between the dollar quotes: exactly what Postgres stores
   * as `pg_proc.prosrc`, which is what `pnpm db:verify` compares.
   */
  source: string;
}

const CREATE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi;
const DROP = /drop\s+function\s+(?:if\s+exists\s+)?([^;]+);/gi;
/**
 * Migration 108's idiom: a DO block that drops every function whose
 * name matches a LIKE pattern, because a hand-written list is how an
 * overload gets left behind. Read as what it is, a drop by pattern.
 */
const DROP_LIKE =
  /proname\s+like\s+'([^']+)'[\s\S]{0,400}?execute\s+format\('drop\s+function/gi;
const DOLLAR_QUOTE = /\bas\s+(\$[a-z_]*\$)/gi;

/** A match on a `-- comment` line is prose about SQL, not SQL. */
function inLineComment(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return text.slice(lineStart, index).includes("--");
}

/** Split on commas that aren't inside parentheses. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** The argument list that opens at `open`, without its parentheses. */
function argumentList(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error("unclosed argument list");
}

/**
 * `public.a(uuid, text), public.b cascade` → `a` with two arguments,
 * `b` with none given. The count matters: a drop that names a
 * signature removes that overload and no other, which is how 116
 * replaced `chork_withdraw_route(uuid)` with a two-argument one by
 * creating the new and dropping the old.
 */
function droppedFunctions(list: string): Array<{ name: string; arity: number | null }> {
  return splitTopLevel(list)
    .map((part) => {
      const m = part.trim().match(/^(?:public\.)?([a-z_0-9]+)\s*(\(([\s\S]*)\))?/i);
      if (!m) return null;
      const args = m[3];
      return {
        name: m[1].toLowerCase(),
        arity: m[2] === undefined ? null : args.trim() === "" ? 0 : splitTopLevel(args).length,
      };
    })
    .filter((d): d is { name: string; arity: number | null } => d !== null);
}

/** Input parameters only: an OUT parameter is not part of a signature. */
function arityOf(args: string): number {
  if (args.trim() === "") return 0;
  return splitTopLevel(args).filter((a) => !/^\s*out\s/i.test(a)).length;
}

function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
}

let cache: Map<string, SqlDefinition> | null = null;

/**
 * Every function the migration set leaves standing, by name: the last
 * `create` of each, unless a later `drop function` removed it.
 *
 * Whether this agrees with the database is not something a unit test
 * can know. `pnpm db:verify` checks it against `pg_proc`.
 */
export function liveDefinitions(): Map<string, SqlDefinition> {
  if (cache) return cache;
  const live = new Map<string, SqlDefinition>();
  const arities = new Map<string, number>();
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS, file), "utf8");
    // Creates and drops, in the order the file runs them.
    const events: Array<{ index: number; apply: () => void }> = [];

    for (const m of text.matchAll(CREATE)) {
      if (inLineComment(text, m.index)) continue;
      const name = m[1].toLowerCase();
      DOLLAR_QUOTE.lastIndex = m.index;
      const quote = DOLLAR_QUOTE.exec(text);
      if (!quote) throw new Error(`${file}: ${name} has no dollar-quoted body`);
      const tag = quote[1];
      const sourceStart = quote.index + quote[0].length;
      const sourceEnd = text.indexOf(tag, sourceStart);
      const end = text.indexOf(";", sourceEnd);
      if (sourceEnd === -1 || end === -1) {
        throw new Error(`${file}: ${name} is never closed with ${tag};`);
      }
      const definition: SqlDefinition = {
        name,
        file,
        body: text.slice(m.index, end + 1),
        source: text.slice(sourceStart, sourceEnd),
      };
      const arity = arityOf(argumentList(text, m.index + m[0].length - 1));
      events.push({
        index: m.index,
        apply: () => {
          live.set(name, definition);
          arities.set(name, arity);
        },
      });
    }

    for (const m of text.matchAll(DROP)) {
      if (inLineComment(text, m.index)) continue;
      for (const dropped of droppedFunctions(m[1])) {
        events.push({
          index: m.index,
          apply: () => {
            // A different argument count is a different overload.
            if (dropped.arity !== null && arities.get(dropped.name) !== dropped.arity) return;
            live.delete(dropped.name);
          },
        });
      }
    }

    for (const m of text.matchAll(DROP_LIKE)) {
      const pattern = likeToRegExp(m[1]);
      events.push({
        index: m.index,
        apply: () => {
          for (const name of [...live.keys()]) if (pattern.test(name)) live.delete(name);
        },
      });
    }

    events.sort((a, b) => a.index - b.index).forEach((e) => e.apply());
  }

  cache = live;
  return live;
}

/** Live definition of `name`, or throw if no migration leaves one. */
export function latestDefinition(name: string): SqlDefinition {
  const found = liveDefinitions().get(name.toLowerCase());
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
