import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { latestDefinition } from "@/test/sql-definitions";

/**
 * `route_logs.set_id` is DERIVED, never supplied.
 *
 * Migration 080 denormalised `set_id` onto `route_logs` so the Match
 * branch of the read policy is one indexed check instead of a join
 * back through `routes`. That's the same trick migration 002 used for
 * `gym_id` — and migration 073 is the record of what it costs when
 * the copy is trusted: the insert policy checked membership and
 * liveness but never that the route actually belonged to the gym
 * named, so a hand-crafted request could land a log from gym B's wall
 * on gym A's leaderboard.
 *
 * `set_id` closes that hole by construction rather than by policy: a
 * trigger (migration 081) overwrites whatever the client sent with
 * the route's real set on every insert, and on any update that moves
 * the log to a different route. A caller may omit it; a caller that
 * lies has the lie corrected.
 *
 * Both halves are pinned here because either one alone is a false
 * sense of safety — the trigger without the app discipline means
 * silent overwrites nobody expects, and the app discipline without
 * the trigger means the next writer re-opens 073.
 */

const SRC = join(process.cwd(), "src");

/** Every `.ts`/`.tsx` file under src, minus tests. */
function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The argument text of every `.insert(…)` / `.upsert(…)` /
 * `.update(…)` call in a file, found by balancing parens so a nested
 * call or object doesn't truncate the payload early.
 */
function writePayloads(text: string): string[] {
  const out: string[] = [];
  const call = /\.(insert|upsert|update)\(/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(text)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
    }
    out.push(text.slice(match.index, i));
  }
  return out;
}

describe("route_logs.set_id is derived by the database", () => {
  it("has a trigger that fires before insert and before a route change", () => {
    const { body, file } = latestDefinition("route_logs_derive_set_id");

    // Reads the route, not the payload.
    expect(body).toMatch(/select\s+r\.set_id\s+into\s+new\.set_id/);
    expect(body).toMatch(/where\s+r\.id\s*=\s*new\.route_id/);
    expect(body).toMatch(/security definer/);

    // The function is only half the contract — an unattached trigger
    // function is dead code that reads like protection.
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", file),
      "utf8",
    );
    expect(sql).toMatch(
      /before insert or update of route_id on public\.route_logs/,
    );
  });

  it("is not executable by clients — only the trigger runs it", () => {
    const { file } = latestDefinition("route_logs_derive_set_id");
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", file),
      "utf8",
    );
    expect(sql).toMatch(
      /revoke execute on function public\.route_logs_derive_set_id\(\) from anon, authenticated, public/,
    );
  });

  it("no app code writes set_id in a route_logs payload", () => {
    // A write that names `set_id` is either dead (the trigger wins) or
    // an attempt to override the derivation. Both are worth a failure.
    // Reads are fine — `.eq("set_id", …)` is the whole point of
    // denormalising it — so this looks only inside write payloads.
    const offenders = sourceFiles()
      .map((path) => ({ path, text: readFileSync(path, "utf8") }))
      .filter(({ text }) => /from\(\s*["'`]route_logs["'`]\s*\)/.test(text))
      .filter(({ text }) =>
        writePayloads(stripComments(text)).some((payload) =>
          /\bset_id\s*:/.test(payload),
        ),
      )
      .map(({ path }) => path.replace(`${process.cwd()}/`, ""));

    expect(offenders).toEqual([]);
  });
});
