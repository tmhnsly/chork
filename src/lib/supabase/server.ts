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
 * Cached getUser — same cookie context as `createServerSupabase`, but
 * returned value is memoised per render. Any server component, layout,
 * server action, or auth helper that reads the current user during a
 * single request shares the result instead of hitting auth.getUser
 * repeatedly.
 */
export const getServerUser = cache(async () => {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Cached profile row for the current user. Returned as-shipped from
 * the DB so any caller can destructure `onboarded`, `active_gym_id`,
 * etc. without another query. Null when the user isn't signed in or
 * the trigger hasn't created the profile yet.
 */
export const getServerProfile = cache(async () => {
  const user = await getServerUser();
  if (!user) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data ?? null;
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

/**
 * Client for use INSIDE unstable_cache bodies. Cache entries are
 * shared across users, so they can't depend on the caller's auth
 * cookies. This client uses the service role key and bypasses RLS —
 * cached helpers must authorise via page-level checks BEFORE the
 * cached call (requireAuth / requireGymAdmin). RPCs that internally
 * gate on auth.uid() via is_gym_member() are NOT safe to call from
 * here — they return empty because auth.uid() is null.
 */
export function createCachedContextClient() {
  return createServiceClient();
}
