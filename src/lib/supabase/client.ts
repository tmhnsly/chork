import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

/**
 * Browser Supabase client — uses the anon key. Safe for client
 * components; RLS enforces data access.
 *
 * Memoised to a module-level singleton because components across the
 * app (NavBar badge count, NotificationsSheet, PushToggle, …) each
 * called `createBrowserSupabase()` in their own effects, allocating
 * a fresh fetch pipeline + auth listener per mount. `@supabase/ssr`
 * internally shares the auth session via localStorage so the session
 * state is already coherent; only the transport object itself was
 * duplicating. One shared instance = one GoTrue subscription.
 */
let _client: SupabaseClient<Database> | null = null;

export function createBrowserSupabase(): SupabaseClient<Database> {
  if (_client) return _client;
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return _client;
}
