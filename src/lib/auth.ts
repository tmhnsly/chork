import "server-only";
import { createServerSupabase } from "./supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { Profile } from "./data/types";

type AuthSuccess = {
  supabase: SupabaseClient<Database>;
  userId: string;
  profile: Profile;
};
type AuthFailure = { error: string };

/**
 * Require authentication for a server action.
 * Returns the Supabase client, user ID, and profile.
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: "You need to be signed in to do that" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  return { supabase, userId: user.id, profile };
}
