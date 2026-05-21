import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import type { Route } from "./types";

import { tags } from "@/lib/cache/tags";
import { readMany, readSingle } from "./read";

type Supabase = SupabaseClient<Database>;

export function getRoutesBySet(setId: string): Promise<Route[]> {
  const fn = cachedQuery(
    ["routes-by-set", setId],
    async (id: string): Promise<Route[]> => {
      const supabase = createCachedContextClient();
      return readMany<Route>(
        supabase
          .from("routes")
          .select("*")
          .eq("set_id", id)
          .order("number")
          // Ceiling-guard. Normal sets are <100 routes; 300 covers
          // outlier jam-style mega-sets without letting a pathological
          // seed ship a 10k-row payload to the wall.
          .limit(300),
        "getroutesbyset_failed",
      );
    },
    { tags: [tags.setRoutes(setId)], revalidate: 300 },
  );
  return fn(setId);
}

/**
 * Batched variant of `getRoutesBySet` — fetches routes for many sets
 * in a single round-trip and returns a Map keyed by set_id. Avoids
 * N+1 when a page needs per-set route info for a user's entire
 * history (the profile page's previous-sets grid is the canonical
 * caller).
 *
 * Per-render dedupe: the profile page has two sibling Suspense
 * sections (ProfileAchievementsSection + PreviousSetsSection) that
 * both call this with the same `previousSets` ids. React `cache()`
 * compares args by Object.is, so the two `.map(...)` arrays of the
 * same ids would miss the cache. Routing through a string key
 * (sorted-comma-joined) makes the second caller hit the cached
 * result and skip the DB roundtrip.
 */
const getRoutesBySetIdsByKey = cache(
  async (supabase: Supabase, key: string): Promise<Map<string, Route[]>> => {
    const setIds = key === "" ? [] : key.split(",");
    return getRoutesBySetIdsRaw(supabase, setIds);
  },
);

export async function getRoutesBySetIds(
  supabase: Supabase,
  setIds: string[]
): Promise<Map<string, Route[]>> {
  const key = [...setIds].sort().join(",");
  return getRoutesBySetIdsByKey(supabase, key);
}

async function getRoutesBySetIdsRaw(
  supabase: Supabase,
  setIds: string[]
): Promise<Map<string, Route[]>> {
  const byId = new Map<string, Route[]>();
  if (setIds.length === 0) return byId;

  const rows = await readMany<Route>(
    supabase.from("routes").select("*").in("set_id", setIds).order("number"),
    "getroutesbysetids_failed",
  );
  for (const route of rows) {
    const arr = byId.get(route.set_id) ?? [];
    arr.push(route);
    byId.set(route.set_id, arr);
  }
  return byId;
}

/**
 * Community grade lives on `routes.community_grade` — denormalised
 * by the trigger in migration 026. Reading it is a single indexed
 * row fetch, no aggregation. Callers that already have the route
 * row in hand can read `route.community_grade` directly and skip
 * this call entirely.
 */
export function getRouteGrade(routeId: string): Promise<number | null> {
  const fn = cachedQuery(
    ["route-grade", routeId],
    async (id: string): Promise<number | null> => {
      const supabase = createCachedContextClient();
      const row = await readSingle<{ community_grade: number | null }>(
        supabase.from("routes").select("community_grade").eq("id", id).maybeSingle(),
        "getroutegrade_failed",
      );
      return row?.community_grade ?? null;
    },
    { tags: [tags.routeGrade(routeId)], revalidate: 300 },
  );
  return fn(routeId);
}
