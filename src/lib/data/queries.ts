import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { cachedQuery } from "@/lib/cache/cached";
import { createCachedContextClient } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/validation";
import type {
  Profile,
  Gym,
  RouteSet,
  Route,
  RouteLog,
  Comment,
  PaginatedComments,
  ActivityEventWithRoute,
} from "./types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import { tags } from "@/lib/cache/tags";
/**
 * ── Error contract ────────────────────────────────────────────────
 *
 * Reads in this file (and every `*-queries.ts` sibling) follow one
 * shape: **swallow the Postgres error, log to console, return a
 * neutral fallback** (`null` / `[]` / a zero-shaped object). Render
 * paths shouldn't have to wrap every fetch in try/catch — a missing
 * row is treated the same as "absent" and the page degrades to its
 * empty state.
 *
 * Mutations in `mutations.ts` and `*-mutations.ts` follow the
 * opposite shape: **throw** on error so the caller (server action)
 * can format and surface the message via `formatError`. Mutations
 * touching shared state need an explicit failure mode; reads can
 * coast through one.
 *
 * If a read genuinely needs to surface "this failed for a reason
 * other than absence", expose it via a richer result type
 * (`{ data, error }` discriminated union) rather than throwing —
 * keep callers free of try/catch.
 */
type Supabase = SupabaseClient<Database>;

// ── Profiles ───────────────────────────────────────

export async function getProfile(supabase: Supabase, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    logger.warn("getprofile_failed", { err: formatErrorForLog(error) });
    return null;
  }
  return data;
}

export const getProfileByUsername = cache(
  async (username: string): Promise<Profile | null> => {
    const fn = cachedQuery(
      ["profile-by-username", username],
      async (u: string): Promise<Profile | null> => {
        const supabase = createCachedContextClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("username", u)
          .single();
        if (error) {
          logger.warn("getprofilebyusername_failed", { err: formatErrorForLog(error) });
          return null;
        }
        return data;
      },
      {
        // Tag must be known at wrap time; username is the only keyable
        // thing we have until the fetch resolves. On rename, updateProfile
        // revalidates both old and new username tags (Phase 3).
        tags: [tags.userByUsername(username)],
        revalidate: 300,
      },
    );
    return fn(username);
  },
);

// ── Gyms ───────────────────────────────────────────

export async function searchGyms(supabase: Supabase, query: string): Promise<Gym[]> {
  const safe = escapeLikePattern(query.trim());
  if (!safe) return [];
  const { data, error } = await supabase
    .from("gyms")
    .select("*")
    .eq("is_listed", true)
    .ilike("name", `%${safe}%`)
    .order("name")
    .limit(20);
  if (error) {
    logger.warn("searchgyms_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return data ?? [];
}

export function getGym(gymId: string): Promise<Gym | null> {
  const fn = cachedQuery(
    ["gym", gymId],
    async (id: string): Promise<Gym | null> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase
        .from("gyms")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        logger.warn("getgym_failed", { err: formatErrorForLog(error) });
        return null;
      }
      return data;
    },
    { tags: [tags.gym(gymId)], revalidate: 3600 },
  );
  return fn(gymId);
}

// ── Sets ───────────────────────────────────────────

export function getCurrentSet(gymId: string): Promise<RouteSet | null> {
  const fn = cachedQuery(
    ["set-active", gymId],
    async (id: string): Promise<RouteSet | null> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase
        .from("sets")
        .select("*")
        .eq("gym_id", id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (error) {
        logger.warn("getcurrentset_failed", { err: formatErrorForLog(error) });
        return null;
      }
      return data;
    },
    { tags: [tags.gymActiveSet(gymId)], revalidate: 60 },
  );
  return fn(gymId);
}

/**
 * Returns the 200 most recent sets for a gym. Callers that want to
 * scope by "sets that overlapped the user's tenure" should pass the
 * profile's `created_at` — the filter runs in-memory on the 200-row
 * result, not in SQL. Keeping `sinceIso` out of the cache key was a
 * deliberate trade: previously every unique user-creation-date
 * spawned its own cache entry, collapsing hit rate to ~1:1 as the
 * user base grew. Now the entry is scoped to the gym alone, so every
 * climber at the same gym shares the cache. Filtering 200 rows is
 * trivial JS cost; re-fetching per user was the real bill.
 */
// Wrapped in React.cache() so the three streamed profile sections
// (ProfileStats, ProfileAchievementsSection, PreviousSetsSection)
// share one promise within the render. unstable_cache dedupes at the
// data layer; React.cache adds the per-render dedupe so the call
// resolves once even if multiple siblings await it concurrently.
export const getAllSets = cache(
  async (gymId: string, sinceIso?: string): Promise<RouteSet[]> => {
    const fn = cachedQuery(
      ["sets", gymId],
      async (id: string): Promise<RouteSet[]> => {
        const supabase = createCachedContextClient();
        const { data, error } = await supabase
          .from("sets")
          .select("*")
          .eq("gym_id", id)
          .order("starts_at", { ascending: false })
          // Ceiling-guard. Profile streak + history surfaces show the
          // 200 most recent sets overlapping the user's tenure; older
          // history is archive-only and would otherwise pull the whole
          // gym's set history on every render. At 200 a long-running
          // gym (weekly resets for 4 years = ~210 sets) has one set
          // clipped; past that, callers paginate explicitly.
          .limit(200);
        if (error) {
          logger.warn("getallsets_failed", { err: formatErrorForLog(error) });
          return [];
        }
        return data ?? [];
      },
      { tags: [tags.gymActiveSet(gymId)], revalidate: 300 },
    );
    const all = await fn(gymId);
    // In-memory filter — callers pass their profile's `created_at` to
    // hide sets that finished before they joined. Filter runs on the
    // capped 200-row result so it's a few-microseconds linear scan.
    return sinceIso ? all.filter((s) => s.ends_at >= sinceIso) : all;
  },
);

// ── Routes ─────────────────────────────────────────

export function getRoutesBySet(setId: string): Promise<Route[]> {
  const fn = cachedQuery(
    ["routes-by-set", setId],
    async (id: string): Promise<Route[]> => {
      const supabase = createCachedContextClient();
      const { data, error } = await supabase
        .from("routes")
        .select("*")
        .eq("set_id", id)
        .order("number")
        // Ceiling-guard. Normal sets are <100 routes; 300 covers
        // outlier jam-style mega-sets without letting a pathological
        // seed ship a 10k-row payload to the wall.
        .limit(300);
      if (error) {
        logger.warn("getroutesbyset_failed", { err: formatErrorForLog(error) });
        return [];
      }
      return data ?? [];
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

  const { data, error } = await supabase
    .from("routes")
    .select("*")
    .in("set_id", setIds)
    .order("number");
  if (error) {
    logger.warn("getroutesbysetids_failed", { err: formatErrorForLog(error) });
    return byId;
  }

  for (const route of data ?? []) {
    const arr = byId.get(route.set_id) ?? [];
    arr.push(route);
    byId.set(route.set_id, arr);
  }
  return byId;
}

// ── Route logs ─────────────────────────────────────

export async function getLogsBySetForUser(
  supabase: Supabase,
  setId: string,
  userId: string
): Promise<RouteLog[]> {
  const { data, error } = await supabase
    .from("route_logs")
    .select("*, routes!inner(set_id)")
    .eq("routes.set_id", setId)
    .eq("user_id", userId);
  if (error) {
    logger.warn("getlogsbysetforuser_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return (data ?? []) as RouteLog[];
}


export interface UserLogInGym {
  route_id: string;
  set_id: string;
  attempts: number;
  completed: boolean;
  zone: boolean;
}

/**
 * Single-call fetch of everything the profile page needs for all-time stats
 * and per-set mini grids — user's logs scoped to the gym, plus the total
 * number of routes in that gym for the coverage denominator.
 */
export async function getAllRouteDataForUserInGym(
  supabase: Supabase,
  gymId: string,
  userId: string,
  setIds: string[]
): Promise<{ logs: UserLogInGym[]; totalRoutesInGym: number }> {
  if (setIds.length === 0) return { logs: [], totalRoutesInGym: 0 };

  const [logsResult, routesResult] = await Promise.all([
    // Inner-join `routes` and constrain by `set_id` IN setIds so logs
    // from sets the caller filtered out (e.g. sets that ended before
    // the climber's account existed) don't leak into the aggregates.
    // Without this filter, `uniqueRoutesAttempted` could exceed
    // `totalRoutesInGym` — a "20/14 coverage" bug on long-history gyms.
    supabase
      .from("route_logs")
      .select("route_id, attempts, completed, zone, routes!inner(set_id)")
      .eq("user_id", userId)
      .eq("gym_id", gymId)
      .in("routes.set_id", setIds),
    supabase
      .from("routes")
      .select("id", { count: "exact", head: true })
      .in("set_id", setIds),
  ]);

  if (logsResult.error) {
    logger.warn("getallroutedataforuseringym_logs_failed", { err: formatErrorForLog(logsResult.error) });
  }
  if (routesResult.error) {
    logger.warn("getallroutedataforuseringym_count_failed", { err: formatErrorForLog(routesResult.error) });
  }

  type LogRow = {
    route_id: string;
    attempts: number;
    completed: boolean;
    zone: boolean;
    routes: { set_id: string } | { set_id: string }[] | null;
  };

  const logs: UserLogInGym[] = (logsResult.data ?? []).map((r: LogRow) => {
    const route = Array.isArray(r.routes) ? r.routes[0] : r.routes;
    return {
      route_id: r.route_id,
      set_id: route?.set_id ?? "",
      attempts: r.attempts,
      completed: r.completed,
      zone: r.zone,
    };
  }).filter((l) => l.set_id !== "");

  return {
    logs,
    totalRoutesInGym: routesResult.count ?? 0,
  };
}

// ── Stats (RPC functions) ──────────────────────────

export async function getUserSetStats(
  supabase: Supabase,
  userId: string,
  gymId: string
): Promise<{ set_id: string; completions: number; flashes: number; points: number }[]> {
  const { data, error } = await supabase.rpc("get_user_set_stats", {
    p_user_id: userId,
    p_gym_id: gymId,
  });
  if (error) {
    logger.warn("getusersetstats_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return data ?? [];
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
      const { data, error } = await supabase
        .from("routes")
        .select("community_grade")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        logger.warn("getroutegrade_failed", { err: formatErrorForLog(error) });
        return null;
      }
      return data?.community_grade ?? null;
    },
    { tags: [tags.routeGrade(routeId)], revalidate: 300 },
  );
  return fn(routeId);
}

// ── Activity events ────────────────────────────────

export async function getActivityEventsForUser(
  supabase: Supabase,
  userId: string,
  limit: number = 10
): Promise<ActivityEventWithRoute[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("*, routes(number)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger.warn("getactivityeventsforuser_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return (data ?? []) as ActivityEventWithRoute[];
}

// ── Comments ───────────────────────────────────────

/**
 * Comments attached to a route, paginated. Cached — comments are
 * gym-scoped (route → set → gym) so every member of the gym that
 * owns the route sees the same result; cross-user cache sharing is
 * correct. Mutations (`postComment`, `editComment`) bust the
 * `route:{id}:comments` tag in `src/app/(app)/actions.ts`, so the
 * cache never serves stale content past a write.
 *
 * Dropped the `supabase` arg — cached reads run through the
 * service-role-backed `createCachedContextClient` so the entry is
 * shared across viewers. Authorisation already happens at the page
 * level (caller can only reach this function via a route they're
 * allowed to open), and the returned payload doesn't include any
 * auth-variant fields.
 */
export function getCommentsByRoute(
  routeId: string,
  page: number = 1,
  perPage: number = 20,
): Promise<PaginatedComments> {
  const fn = cachedQuery(
    ["comments-by-route", routeId, String(page), String(perPage)],
    async (
      rId: string,
      p: number,
      per: number,
    ): Promise<PaginatedComments> => {
      const supabase = createCachedContextClient();
      const from = (p - 1) * per;
      const to = from + per - 1;

      // Single query: fetch data + exact count in one round trip.
      const { data, count, error } = await supabase
        .from("comments")
        .select("*, profiles(id, username, name, avatar_url)", { count: "exact" })
        .eq("route_id", rId)
        .order("likes", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        logger.warn("getcommentsbyroute_failed", { err: formatErrorForLog(error) });
      }

      const totalItems = count ?? 0;
      return {
        items: (data ?? []) as Comment[],
        totalItems,
        totalPages: Math.ceil(totalItems / per),
        page: p,
      };
    },
    { tags: [tags.routeComments(routeId)], revalidate: 60 },
  );
  return fn(routeId, page, perPage);
}

// ── Comment likes ──────────────────────────────────

export async function getLikedCommentIds(
  supabase: Supabase,
  userId: string,
  routeId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("comment_likes")
    .select("comment_id, comments!inner(route_id)")
    .eq("user_id", userId)
    .eq("comments.route_id", routeId);

  if (error) {
    logger.warn("getlikedcommentids_failed", { err: formatErrorForLog(error) });
    return new Set();
  }

  return new Set((data ?? []).map((r) => r.comment_id));
}

// ── Achievements ──────────────────────────────────

/** Return a Map of badge_id → earned_at ISO for the given user. */
export async function getEarnedAchievements(
  supabase: Supabase,
  userId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("user_achievements")
    .select("badge_id, earned_at")
    .eq("user_id", userId);

  if (error) {
    logger.warn("getearnedachievements_failed", { err: formatErrorForLog(error) });
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.badge_id, r.earned_at]));
}

// ── Gym directory ─────────────────────────────────

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
      const { data, error } = await supabase
        .from("gyms")
        .select("id, name, slug, city, country")
        .eq("is_listed", true)
        .order("name");
      if (error) {
        logger.warn("getlistedgyms_failed", { err: formatErrorForLog(error) });
        return [];
      }
      return data ?? [];
    },
    { tags: [tags.gymsListed()], revalidate: 3600 },
  );
  return fn();
}

// ── Profile summary (migration 036) ────────────────

export interface ProfileSummary {
  per_set: Array<{
    set_id: string;
    sends: number;
    flashes: number;
    zones: number;
    points: number;
  }>;
  active_set_detail: Array<{
    route_id: string;
    attempts: number;
    completed: boolean;
    zone: boolean;
  }>;
  total_routes_in_gym: number;
  total_attempts: number;
  unique_routes_attempted: number;
}

export const getProfileSummary = cache(
  async (
    supabase: Supabase,
    userId: string,
    gymId: string,
  ): Promise<ProfileSummary> => {
    const { data, error } = await supabase.rpc("get_profile_summary", {
      p_user_id: userId,
      p_gym_id: gymId,
    });
    if (error) {
      logger.warn("getprofilesummary_failed", { err: formatErrorForLog(error) });
      return {
        per_set: [],
        active_set_detail: [],
        total_routes_in_gym: 0,
        total_attempts: 0,
        unique_routes_attempted: 0,
      };
    }
    return (data as ProfileSummary | null) ?? {
      per_set: [],
      active_set_detail: [],
      total_routes_in_gym: 0,
      total_attempts: 0,
      unique_routes_attempted: 0,
    };
  },
);

