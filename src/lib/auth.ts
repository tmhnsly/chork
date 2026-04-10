import "server-only";
import { createServerSupabase } from "./supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type AuthSuccess = {
  supabase: SupabaseClient<Database>;
  userId: string;
  gymId: string;
};
type AuthFailure = { error: string };

/**
 * Lightweight auth check for server actions.
 * Only fetches active_gym_id from profile — no full profile load.
 * Use this for frequent operations (attempts, zone toggle, likes).
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: "You need to be signed in to do that" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_gym_id")
    .eq("id", user.id)
    .single();

  if (!profile?.active_gym_id) {
    return { error: "No gym selected" };
  }

  return { supabase, userId: user.id, gymId: profile.active_gym_id };
}
