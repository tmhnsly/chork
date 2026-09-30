import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { liveDefinitions } from "./sql-definitions";

/**
 * `supabase/definitions/` holds the current body of every function in
 * the database, one file each, generated from the migrations.
 *
 * Why it exists: a function's live definition was "whichever of N
 * migrations redefined it last", and each redefinition was written by
 * copying an earlier one. `get_match_state_for_user` has nine. 138
 * copied a body older than 121 and silently lost `alt_ceiling`; the
 * attempt-privacy mask was dropped the same way, twice. Nothing showed
 * the loss, because a new migration is all additions in a diff.
 *
 * With this folder a redefinition changes a file that already exists,
 * so the diff shows the lines that went as well as the ones that came.
 * The rule for whoever writes the migration: start from the definition
 * file, never from an older migration, and read the definition's diff
 * before committing. Every removed line must be one you meant.
 *
 * The files are generated. Change a function by writing a migration,
 * then run `pnpm db:definitions`. `pnpm db:verify` checks the same
 * files against the live database.
 */

const DEFINITIONS = join(process.cwd(), "supabase", "definitions");

function fileFor(name: string): string {
  return join(DEFINITIONS, `${name}.sql`);
}

function render(name: string, file: string, body: string): string {
  return [
    `-- public.${name}, as it stands.`,
    `-- Generated from supabase/migrations/${file} by \`pnpm db:definitions\`.`,
    "-- Do not edit: change a function with a migration, then regenerate.",
    "",
    body,
    "",
  ].join("\n");
}

describe("supabase/definitions", () => {
  const live = [...liveDefinitions().values()].sort((a, b) => a.name.localeCompare(b.name));

  it.each(live.map((d) => [d.name, d] as const))(
    "%s matches the last migration that defines it",
    async (name, definition) => {
      await expect(render(name, definition.file, definition.body)).toMatchFileSnapshot(
        fileFor(name),
        `Run \`pnpm db:definitions\`, then read the diff of supabase/definitions/${name}.sql: every removed line must be one you meant to remove.`,
      );
    },
  );

  it("holds no file for a function the migrations no longer leave standing", () => {
    const names = new Set(live.map((d) => d.name));
    const orphans = existsSync(DEFINITIONS)
      ? readdirSync(DEFINITIONS)
          .filter((f) => f.endsWith(".sql"))
          .filter((f) => !names.has(f.replace(/\.sql$/, "")))
      : [];
    // A dropped function's file is deleted by hand, in the commit that
    // drops it, so the deletion is visible too.
    expect(orphans).toEqual([]);
  });
});
