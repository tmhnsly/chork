import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";

/**
 * Browser Supabase client — uses the anon key.
 * Safe for client components. RLS enforces data access.
 */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
