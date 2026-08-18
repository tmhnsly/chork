import { describe, it, expect } from "vitest";

/**
 * `handle_new_user` fires on EVERY account creation — email, Google,
 * and whatever comes next. It is the highest blast radius function in
 * the schema: break it and nobody can sign up at all, and the failure
 * shows up at the auth layer rather than anywhere obviously ours.
 *
 * ⚠️ These read the migration TEXT, and that is not enough on its own.
 * Migration 122 broke email signup for a day — it inserted NULL into
 * `profiles.name`, which is NOT NULL — and every test in this file
 * passed the whole time, because none of them assert the function can
 * actually run. The check that would have caught it inserts a real
 * `auth.users` row inside a transaction and rolls it back; it lives in
 * migration 123's header, and belongs in any future change here.
 *
 * So: treat these as a guard against someone quietly dropping a
 * provider spelling, not as evidence that signup works.
 */
describe("handle_new_user", () => {
  it("still writes a placeholder username for every account", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("handle_new_user");

    // The username is NOT optional — profiles.username is how a
    // climber is addressed everywhere, and onboarding replaces this
    // placeholder rather than filling a blank.
    expect(body).toMatch(/'user_' \|\| replace\(new\.id::text, '-', ''\)/);
  });

  it("reads both spellings each provider uses", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("handle_new_user");

    // Google sends full_name + picture; others send name + avatar_url.
    // Reading both is what lets Apple Sign In land later with no
    // migration of its own — drop a spelling and that stops being true.
    expect(body).toMatch(/raw_user_meta_data ->> 'full_name'/);
    expect(body).toMatch(/raw_user_meta_data ->> 'name'/);
    expect(body).toMatch(/raw_user_meta_data ->> 'avatar_url'/);
    expect(body).toMatch(/raw_user_meta_data ->> 'picture'/);
  });

  it("turns a blank provider value into null, not an empty string", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("handle_new_user");

    // A provider sending "   " would otherwise prefill onboarding with
    // nothing, which reads as a broken field rather than an empty one.
    expect(body).toMatch(/nullif\(trim\(coalesce\(/);
  });

  it("never writes null into a NOT NULL column", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("handle_new_user");

    // `profiles.name` and `profiles.avatar_url` are NOT NULL with ''
    // defaults. Listing them in the INSERT means the trigger owns the
    // value, and `nullif(trim(...), '')` is NULL for any signup with
    // no provider metadata — every email signup. Migration 122 did
    // exactly that and took account creation down with it.
    //
    // The outer coalesce is what lands on the column's own empty
    // string instead. Nothing downstream cares: onboarding reads
    // `profile?.name ?? ""`.
    const inserted = body.slice(body.indexOf("insert into public.profiles"));
    const nullifs = inserted.match(/nullif\(trim\(coalesce\(/g) ?? [];
    const wrapped = inserted.match(/coalesce\(\s*nullif\(trim\(coalesce\(/g) ?? [];
    expect(nullifs.length).toBeGreaterThan(0);
    expect(wrapped.length, "every nullif must be wrapped in a coalesce")
      .toBe(nullifs.length);
  });

  it("stays idempotent", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("handle_new_user");

    // The trigger can fire against a row that already has a profile
    // (re-confirmation, provider linking). Without this it raises and
    // takes the signup down with it.
    expect(body).toMatch(/on conflict \(id\) do nothing/);
  });
});
