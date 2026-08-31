import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  PUSH_CATEGORIES,
  PUSH_CATEGORY_LIST,
  PUSH_CATEGORY_COLUMNS,
  VISIBLE_PUSH_CATEGORIES,
  notifFlagsFromPrefs,
  pushPrefsSignature,
} from "./push-categories";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("push categories — the one home", () => {
  it("matches migration 032's columns exactly", () => {
    const sql = read("supabase/migrations/032_push_category_prefs.sql");
    const migrated = [...sql.matchAll(/add column\s+(push_\w+)/g)].map(
      (m) => m[1],
    );
    expect(migrated.sort()).toEqual([...PUSH_CATEGORY_COLUMNS].sort());
  });

  it("never labels a lane with dead vocabulary", () => {
    // Crews died in migration 108; the settings sheet said "crew"
    // for two renames because the labels had no home. Now they do.
    for (const row of VISIBLE_PUSH_CATEGORIES) {
      expect(row.label.toLowerCase()).not.toContain("crew");
    }
  });

  it("hides sender-less categories from settings but keeps their column", () => {
    // Nothing sends ownership_changed since crews died — the toggle
    // would gate nothing, so it must not render; the column stays so
    // stored preferences survive a future sender.
    expect(PUSH_CATEGORY_LIST).toContain("ownership_changed");
    expect(
      VISIBLE_PUSH_CATEGORIES.some((r) => r.category === "ownership_changed"),
    ).toBe(false);
  });

  // supabase-js only types rows from LITERAL select strings, so the
  // two selects that read these columns stay literal — and pinned
  // here, so adding a category without widening them fails the suite.
  it("pins the literal select in push/server.ts to the column set", () => {
    const src = read("src/lib/push/server.ts");
    for (const col of PUSH_CATEGORY_COLUMNS) {
      expect(src).toContain(col);
    }
  });

  it("pins the auth profile select to the column set", () => {
    const src = read("src/lib/auth-context.tsx");
    for (const col of PUSH_CATEGORY_COLUMNS) {
      expect(src).toContain(col);
    }
  });

  it("derives flags and signature from the same key order", () => {
    const prefs = {
      push_invite_received: true,
      push_invite_accepted: false,
      push_ownership_changed: true,
    };
    expect(notifFlagsFromPrefs(prefs)).toEqual({
      invite_received: true,
      invite_accepted: false,
      ownership_changed: true,
    });
    expect(pushPrefsSignature(prefs)).toBe("true|false|true");
  });

  it("keeps every category's column on the push_ prefix", () => {
    for (const c of PUSH_CATEGORY_LIST) {
      expect(PUSH_CATEGORIES[c].column.startsWith("push_")).toBe(true);
    }
  });
});
