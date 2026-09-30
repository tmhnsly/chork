import "server-only";

import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import type { Gym } from "./types";

import { tags } from "@/lib/cache/tags";
import { readSingle, readMany } from "./read";

export function getGym(gymId: string): Promise<Gym | null> {
  const fn = cachedQuery(
    ["gym", gymId],
    async (id: string): Promise<Gym | null> => {
      const supabase = createCachedContextClient();
      return readSingle<Gym>(
        supabase.from("gyms").select("*").eq("id", id).single(),
        "getgym_failed",
      );
    },
    { tags: [tags.gym(gymId)], revalidate: 3600 },
  );
  return fn(gymId);
}

// Keep this shape + the SELECT column list in `getListedGyms` in sync
// with the client-reachable mirror in `./gym-queries.client.ts` (this
// module is `server-only`, so client surfaces read from there).
export interface GymListing {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
}

/**
 * Publicly-listed gyms. Powers the climber gym switcher — surfacing
 * only gyms the gym admin has opted to list keeps private / staging
 * gyms out of the search.
 */
export function getListedGyms(): Promise<GymListing[]> {
  const fn = cachedQuery(
    ["gyms-listed"],
    async (): Promise<GymListing[]> => {
      const supabase = createCachedContextClient();
      return readMany<GymListing>(
        supabase
          .from("gyms")
          .select("id, name, slug, city, country")
          .eq("is_listed", true)
          .order("name"),
        "getlistedgyms_failed",
      );
    },
    { tags: [tags.gymsListed()], revalidate: 3600 },
  );
  return fn();
}
