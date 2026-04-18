import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Service = SupabaseClient<Database>;

/**
 * Creates an auth user via the admin API and returns credentials the
 * caller can use to sign in. The `handle_new_user` trigger (see
 * migration 001) seeds the corresponding `profiles` row automatically
 * — so once this returns, the user exists everywhere we care about.
 *
 * Emails are namespaced with a timestamp + random suffix so parallel
 * test runs don't collide on the `profiles.email` unique index.
 */
export async function createTestUser(service: Service): Promise<{
  userId: string;
  email: string;
  password: string;
}> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `integration-${suffix}@chork.test`;
  const password = "integration-test-password";

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message}`);
  }

  // Ensure the profile row the trigger wrote has a username so the
  // integration suite doesn't have to run the onboarding flow. Any
  // follow-up update that depends on the profile row existing (e.g.
  // `create_jam` reading `host_display_name`) then has something to
  // read.
  await service
    .from("profiles")
    .update({ username: `int_${suffix.slice(0, 12)}`, onboarded: true })
    .eq("id", data.user.id);

  return { userId: data.user.id, email, password };
}

export async function deleteTestUser(
  service: Service,
  userId: string,
): Promise<void> {
  // `auth.admin.deleteUser` cascades to the profiles row via the FK
  // on `profiles.id`. jam_players rows with this user_id are removed
  // separately by `cleanupJam`.
  await service.auth.admin.deleteUser(userId).catch(() => {
    // Best effort — a partial-cleanup run shouldn't fail the suite.
  });
}

/**
 * Sign the given user in on the anon client. Call once per user
 * per test; subsequent RPC calls on the client send the JWT so
 * `auth.uid()` inside SECURITY DEFINER functions resolves to
 * `userId`.
 */
export async function signInAsUser(
  userClient: Service,
  email: string,
  password: string,
): Promise<void> {
  const { error } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(`signInAsUser failed: ${error.message}`);
}

/**
 * Remove every row that belongs to `jamId` in the order dictated by
 * the FK graph. `jam_summaries` is intentionally NOT touched — if
 * the test left a summary row behind, that's a finding worth seeing
 * in the DB, not silently wiped. Tests that explicitly end a jam
 * pass `alsoDropSummary` to opt in.
 */
export async function cleanupJam(
  service: Service,
  jamId: string,
  opts: { alsoDropSummary?: boolean } = {},
): Promise<void> {
  if (opts.alsoDropSummary) {
    const { data: summaries } = await service
      .from("jam_summaries")
      .select("id")
      .eq("jam_id", jamId);
    for (const s of summaries ?? []) {
      await service.from("jam_summary_players").delete().eq("jam_summary_id", s.id);
    }
    await service.from("jam_summaries").delete().eq("jam_id", jamId);
  }
  await service.from("jam_logs").delete().eq("jam_id", jamId);
  await service.from("jam_routes").delete().eq("jam_id", jamId);
  await service.from("jam_grades").delete().eq("jam_id", jamId);
  await service.from("jam_players").delete().eq("jam_id", jamId);
  await service.from("jams").delete().eq("id", jamId);
}
