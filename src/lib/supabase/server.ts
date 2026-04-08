import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Server Supabase client authenticated from request cookies.
 * Wrapped in React cache() — within a single RSC render, multiple
 * calls return the same instance.
 */
export const createServerSupabase = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — cookie writes are ignored.
          // The middleware handles session refresh.
        }
      },
    },
  });
});

/**
 * Service role client — bypasses RLS. Server-only.
 * Used for operations that need to modify data the user doesn't own
 * (e.g. incrementing comment like counts, deleting activity events on undo).
 */
export function createServiceClient() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error("[chork] SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
