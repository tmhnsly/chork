import { describe, it, expect } from "vitest";

/**
 * `handle_new_user` fires on EVERY account creation — email, Google,
 * and whatever comes next. It is the highest blast radius function in
 * the schema: break it and nobody can sign up at all, and the failure
 * shows up at the auth layer rather than anywhere obviously ours.
 *
 * Migration 122 widened it to carry an OAuth account's display name
 * and avatar through to the profile, so onboarding can prefill them.
 * These read the migration text and pin the parts that are load
 * bearing rather than incidental.
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

  it("stays idempotent", async () => {
    const { latestDefinition } = await import("@/test/sql-definitions");
    const { body } = latestDefinition("handle_new_user");

    // The trigger can fire against a row that already has a profile
    // (re-confirmation, provider linking). Without this it raises and
    // takes the signup down with it.
    expect(body).toMatch(/on conflict \(id\) do nothing/);
  });
});
