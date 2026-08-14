import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";

type Supabase = SupabaseClient<Database>;

/**
 * Client-reachable slice of the gym read layer. The canonical
 * `getListedGyms` in `./gym-queries.ts` is `server-only` (it runs the
 * service-role client inside `cachedQuery`), so client surfaces like
 * the gym switcher import from here instead.
 *
 * Keep `GymListing` and the SELECT column list below in sync with
 * `getListedGyms` in `./gym-queries.ts` — same shape, two runtimes.
 */
export interface GymListing {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
}

/**
 * Publicly-listed gyms, read with the caller's own (browser) client.
 * Unlike the `readMany`-based server reads this THROWS on a Postgres
 * error rather than degrading to `[]` — the picker needs a retryable
 * error state, not a misleading empty "No gyms" list.
 */
export async function getListedGymsClient(
  supabase: Supabase,
): Promise<GymListing[]> {
  const { data, error } = await supabase
    .from("gyms")
    .select("id, name, slug, city, country")
    .eq("is_listed", true)
    .order("name");
  if (error) {
    logger.error("gym_listing_failed", { err: formatErrorForLog(error) });
    throw error;
  }
  return data ?? [];
}
