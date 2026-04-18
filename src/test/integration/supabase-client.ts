import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * True when integration tests have the creds they need. Drives the
 * top-level `describe.skipIf(!canRunIntegration)` so the suite
 * silently no-ops in CI / forks that don't provide the service role
 * key (failures there would otherwise be noise).
 *
 * Locally: `pnpm test:integration` loads the service key from
 * `.env.local` before invoking vitest.
 */
export const canRunIntegration = Boolean(URL && ANON && SERVICE);

/**
 * Service-role client — bypasses RLS. Used to provision + clean up
 * test fixtures (insert / delete jam rows, create / remove test
 * users via the admin API).
 */
export function makeServiceClient(): SupabaseClient<Database> {
  if (!URL || !SERVICE) {
    throw new Error("integration test: missing SUPABASE env");
  }
  return createClient<Database>(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Anon-role client — identical to the browser client. Used for
 * authenticated RPC calls so `auth.uid()` resolves to the test user
 * inside SECURITY DEFINER functions (the same way a real client
 * would). One client per test that signs in via
 * `signInAsUser`.
 */
export function makeUserClient(): SupabaseClient<Database> {
  if (!URL || !ANON) {
    throw new Error("integration test: missing SUPABASE env");
  }
  return createClient<Database>(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
