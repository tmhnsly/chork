import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
type Supabase = SupabaseClient<Database>;

// ────────────────────────────────────────────────────────────────
// Types — shaped for what the UI actually renders
// ────────────────────────────────────────────────────────────────

export interface Crew {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  /** Count of active members. Filled by getMyCrews via a sub-aggregation. */
  member_count: number;
}

export interface PendingInvite {
  id: string;
  crew_id: string;
  crew_name: string;
  invited_by: string;
  invited_by_username: string;
  created_at: string;
}

export interface CrewMember {
  user_id: string;
  username: string;
  name: string;
  avatar_url: string;
  status: "pending" | "active";
  joined_at: string;
}

export interface CrewLeaderboardRow {
  user_id: string;
  username: string;
  name: string;
  avatar_url: string;
  /** Null for members with zero points on the selected set. */
  rank: number | null;
  sends: number;
  flashes: number;
  zones: number;
  points: number;
}

export interface CrewActivityEvent {
  route_log_id: string;
  user_id: string;
  username: string;
  avatar_url: string;
  route_id: string;
  route_number: number;
  set_id: string;
  set_name: string | null;
  set_starts_at: string;
  set_ends_at: string;
  gym_id: string;
  gym_name: string;
  is_flash: boolean;
  is_zone: boolean;
  happened_at: string;
}

export interface UserSearchResult {
  user_id: string;
  username: string;
  name: string;
  avatar_url: string;
  active_gym_id: string | null;
  active_gym_name: string | null;
  /**
   * Has the caller already sent this user a pending invite to any crew?
   * Used to disable the "Invite" action on the search result row.
   */
  has_pending_invite: boolean;
  /** Are the two users already active members of at least one shared crew? */
  shares_crew: boolean;
}

// ────────────────────────────────────────────────────────────────
// Crews the caller belongs to (or has been invited to)
// ────────────────────────────────────────────────────────────────

/**
 * Every crew the caller is an *active* member of, newest crew first.
 * Includes a lightweight member_count pulled with a second fetch.
 */
export async function getMyCrews(
  supabase: Supabase,
  userId: string
): Promise<Crew[]> {
  const { data: memberRows, error } = await supabase
    .from("crew_members")
    .select("crew_id, crews:crew_id (id, name, created_by, created_at)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    logger.warn("getmycrews_failed", { err: formatErrorForLog(error) });
    return [];
  }

  const crewRows = (memberRows ?? []).flatMap((row) => {
    const c = Array.isArray(row.crews) ? row.crews[0] : row.crews;
    return c ? [c] : [];
  });
  if (crewRows.length === 0) return [];

  // Server-side count per crew (migration 035). Previously this
  // fetched every member row and tallied client-side — fine at 3
  // crews, wasteful as the user joins more.
  const { data: counts } = await supabase.rpc("get_crew_member_counts", {
    p_crew_ids: crewRows.map((c) => c.id),
  });

  const tally = new Map<string, number>();
  for (const row of counts ?? []) {
    tally.set(row.crew_id, row.count);
  }

  return crewRows
    .map((c) => ({
      id: c.id,
      name: c.name,
      created_by: c.created_by,
      created_at: c.created_at,
      member_count: tally.get(c.id) ?? 0,
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Pending invitations addressed to the caller. Drives the banner at
 * the top of the Crew tab and the badge on the nav icon.
 */
export async function getPendingCrewInvites(
  supabase: Supabase,
  userId: string
): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from("crew_members")
    .select(`
      id,
      crew_id,
      invited_by,
      created_at,
      crews:crew_id (name),
      inviter:invited_by (username)
    `)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    logger.warn("getpendingcrewinvites_failed", { err: formatErrorForLog(error) });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const crew = Array.isArray(row.crews) ? row.crews[0] : row.crews;
    const inviter = Array.isArray(row.inviter) ? row.inviter[0] : row.inviter;
    if (!crew || !inviter) return [];
    return [{
      id: row.id,
      crew_id: row.crew_id,
      crew_name: crew.name,
      invited_by: row.invited_by,
      invited_by_username: inviter.username,
      created_at: row.created_at,
    }];
  });
}

/**
 * Batch lookup of the first N active members per crew, used for the
 * avatar stacks on the /crew picker cards. One round trip for N
 * crews instead of N round trips — see migration 030.
 *
 * Returns a Map keyed by crew_id so callers can thread the preview
 * onto their crew rows with zero bookkeeping.
 */
export async function getCrewMemberPreviews(
  supabase: Supabase,
  crewIds: string[],
  limit = 4,
): Promise<Map<string, Pick<CrewMember, "user_id" | "username" | "name" | "avatar_url">[]>> {
  if (crewIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc("get_crew_member_previews", {
    p_crew_ids: crewIds,
    p_limit: limit,
  });
  if (error) {
    logger.warn("getcrewmemberpreviews_failed", { err: formatErrorForLog(error) });
    return new Map();
  }

  const byCrew = new Map<string, Pick<CrewMember, "user_id" | "username" | "name" | "avatar_url">[]>();
  for (const row of data ?? []) {
    const arr = byCrew.get(row.crew_id) ?? [];
    arr.push({
      user_id: row.user_id,
      username: row.username,
      name: row.name,
      avatar_url: row.avatar_url,
    });
    byCrew.set(row.crew_id, arr);
  }
  return byCrew;
}

/** Active members of a crew, ranked in insertion order. */
export async function getCrewMembers(
  supabase: Supabase,
  crewId: string
): Promise<CrewMember[]> {
  const { data, error } = await supabase
    .from("crew_members")
    .select(`
      status,
      created_at,
      user_id,
      profiles:user_id (username, name, avatar_url)
    `)
    .eq("crew_id", crewId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    logger.warn("getcrewmembers_failed", { err: formatErrorForLog(error) });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!prof) return [];
    return [{
      user_id: row.user_id,
      username: prof.username,
      name: prof.name,
      avatar_url: prof.avatar_url,
      status: row.status as "pending" | "active",
      joined_at: row.created_at,
    }];
  });
}

/** Crew-scoped leaderboard via SQL RPC — see migration 022. */
export async function getCrewLeaderboard(
  supabase: Supabase,
  crewId: string,
  setId: string,
  limit = 50,
  offset = 0
): Promise<CrewLeaderboardRow[]> {
  const { data, error } = await supabase.rpc("get_crew_leaderboard", {
    p_crew_id: crewId,
    p_set_id: setId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    logger.warn("getcrewleaderboard_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return (data ?? []).map((r) => ({
    user_id: r.user_id,
    username: r.username,
    name: r.name,
    avatar_url: r.avatar_url,
    rank: r.rank === null ? null : Number(r.rank),
    sends: r.sends,
    flashes: r.flashes,
    zones: r.zones,
    points: r.points,
  }));
}

/**
 * Activity feed. Two flavours:
 *   - No `crewId` → union feed across every crew the caller is in.
 *   - With `crewId` → restricted to mates sharing *that* crew.
 *
 * `before` is a cursor — pass the oldest `happened_at` you already
 * have to load the next page. Returns newest-first.
 */
export async function getCrewActivityFeed(
  supabase: Supabase,
  limit = 30,
  before: string | null = null,
  crewId: string | null = null,
): Promise<CrewActivityEvent[]> {
  const { data, error } = crewId
    ? await supabase.rpc("get_crew_activity_feed", {
        p_crew_id: crewId,
        p_limit: limit,
        p_before: before ?? undefined,
      })
    : await supabase.rpc("get_crew_activity_feed", {
        p_limit: limit,
        p_before: before ?? undefined,
      });
  if (error) {
    logger.warn("getcrewactivityfeed_failed", { err: formatErrorForLog(error) });
    return [];
  }
  return (data ?? []) as CrewActivityEvent[];
}

// ────────────────────────────────────────────────────────────────
// Active gym sets — powers the set picker on the Crew leaderboard
// ────────────────────────────────────────────────────────────────

export interface ActiveSetOption {
  set_id: string;
  set_name: string | null;
  set_starts_at: string;
  set_ends_at: string;
  gym_id: string;
  gym_name: string;
}

/**
 * Every live set across every listed gym. Small enough (one row per
 * gym at most) to ship directly to the client.
 */
export async function getAllLiveSets(
  supabase: Supabase
): Promise<ActiveSetOption[]> {
  const { data, error } = await supabase
    .from("sets")
    .select(`
      id,
      name,
      starts_at,
      ends_at,
      gym_id,
      gyms:gym_id (name)
    `)
    .eq("status", "live");

  if (error) {
    logger.warn("getalllivesets_failed", { err: formatErrorForLog(error) });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const gym = Array.isArray(row.gyms) ? row.gyms[0] : row.gyms;
    if (!gym) return [];
    return [{
      set_id: row.id,
      set_name: row.name,
      set_starts_at: row.starts_at,
      set_ends_at: row.ends_at,
      gym_id: row.gym_id,
      gym_name: gym.name,
    }];
  });
}

// ────────────────────────────────────────────────────────────────
// User search for the invite flow
// ────────────────────────────────────────────────────────────────

/**
 * Global climber search for the invite flow. Excludes:
 *   • the caller themselves,
 *   • climbers with allow_crew_invites = false,
 *   • climbers the caller has blocked,
 *   • climbers who have blocked the caller.
 *
 * Annotates each row with `has_pending_invite` + `shares_crew` so the
 * invite button can reflect the relationship state.
 */
export async function searchClimbersForInvite(
  supabase: Supabase,
  query: string,
  callerId: string,
  limit = 20
): Promise<UserSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Fuzzy search via `search_climbers_fuzzy` RPC (migration 027).
  // pg_trgm `word_similarity` catches typos and near-matches that a
  // bare `ilike '%q%'` would miss ("Magns" → "Magnus"). Results
  // come back pre-ranked by similarity score so the best candidate
  // lands first — the in-app block/crew filters below just trim
  // the already-sorted list.
  const { data: profiles, error } = await supabase.rpc(
    "search_climbers_fuzzy",
    {
      p_query: q,
      p_caller_id: callerId,
      p_limit: limit * 2,
    },
  );

  if (error || !profiles) {
    logger.warn("searchclimbersforinvite_failed", { err: formatErrorForLog(error) });
    return [];
  }
  if (profiles.length === 0) return [];

  const profileIds = profiles.map((p) => p.id);

  // Parallel: gyms, pending invites from caller, and the set of users
  // sharing an active crew with the caller.
  const [
    { data: gymRows },
    { data: pendingInvites },
    { data: mySharedCrews },
  ] = await Promise.all([
    supabase.from("gyms").select("id, name")
      .in("id", profiles.map((p) => p.active_gym_id).filter(Boolean) as string[]),
    supabase.from("crew_members").select("user_id")
      .eq("invited_by", callerId)
      .eq("status", "pending")
      .in("user_id", profileIds),
    supabase.from("crew_members").select("crew_id").eq("user_id", callerId).eq("status", "active"),
  ]);

  const gymNames = new Map((gymRows ?? []).map((g) => [g.id, g.name]));
  const pendingToIds = new Set((pendingInvites ?? []).map((r) => r.user_id));

  // Resolve shared-crew membership — only need this if the caller is in
  // any crew at all.
  const myCrewIds = (mySharedCrews ?? []).map((r) => r.crew_id);
  let sharesCrewWith = new Set<string>();
  if (myCrewIds.length > 0) {
    const { data: coMembers } = await supabase
      .from("crew_members")
      .select("user_id")
      .in("crew_id", myCrewIds)
      .eq("status", "active")
      .in("user_id", profileIds);
    sharesCrewWith = new Set((coMembers ?? []).map((r) => r.user_id));
  }

  const filtered = profiles.slice(0, limit);

  return filtered.map((p) => ({
    user_id: p.id,
    username: p.username,
    name: p.name ?? "",
    avatar_url: p.avatar_url ?? "",
    active_gym_id: p.active_gym_id,
    active_gym_name: p.active_gym_id ? gymNames.get(p.active_gym_id) ?? null : null,
    has_pending_invite: pendingToIds.has(p.id),
    shares_crew: sharesCrewWith.has(p.id),
  }));
}

/** How many crews a user is an active member of — used in the profile context line. */
export async function getCrewCountForUser(
  supabase: Supabase,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("crew_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) {
    logger.warn("getcrewcountforuser_failed", { err: formatErrorForLog(error) });
    return 0;
  }
  return count ?? 0;
}
