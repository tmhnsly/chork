import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/test/sql-definitions";

/**
 * Achievement timestamps stay with their owner (migration 132).
 *
 * A badge is earned by a send, so `earned_at` is a send time, and the
 * moment a ladder last moved is a send time too. Both are the "when
 * was this person at the gym" inference CLAUDE.md's coarse-timestamp
 * rule exists to prevent — and 131 shipped the second of them to
 * every visitor before review caught it. These pin the shape that
 * closed it, on the SQL that actually runs (last definition wins).
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const migrationText = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");

describe("get_achievement_activity", () => {
  const { body } = latestDefinition("get_achievement_activity");

  it("takes no uid — it is the caller's own activity by construction", () => {
    expect(body).toMatch(/get_achievement_activity\s*\(\s*\)/);
    expect(body).not.toMatch(/p_user_id/);
    expect(body).toMatch(/auth\.uid\(\)/);
  });

  it("returns days, not clock times", () => {
    const returns = body.slice(body.indexOf("returns table"), body.indexOf("language"));
    expect(returns).toMatch(/last_flash_on date/);
    expect(returns).toMatch(/last_send_on date/);
    expect(returns).toMatch(/last_match_on date/);
    expect(returns).not.toMatch(/timestamptz/);
  });
});

describe("get_earned_achievements", () => {
  const { body } = latestDefinition("get_earned_achievements");

  it("hands out the DAY a badge was earned, never the time", () => {
    expect(body).toMatch(/earned_at::date/);
    const returns = body.slice(body.indexOf("returns table"), body.indexOf("language"));
    expect(returns).toMatch(/earned_on date/);
    expect(returns).not.toMatch(/timestamptz/);
  });
});

describe("user_achievements", () => {
  it("is own-rows-only to read; everyone else goes through the RPC", () => {
    const sql = migrationText();
    // 010's open policy is dropped, and the replacement scopes to the
    // caller. Order matters: the drop must come after the create it
    // reverses, which sorting by filename guarantees.
    const openIdx = sql.lastIndexOf('create policy "user_achievements readable by authenticated"');
    const dropIdx = sql.lastIndexOf('drop policy if exists "user_achievements readable by authenticated"');
    expect(dropIdx).toBeGreaterThan(openIdx);
    const own = sql.slice(sql.lastIndexOf('create policy "user_achievements: own rows"'));
    expect(own).toMatch(/for select/);
    expect(own).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/);
  });
});
