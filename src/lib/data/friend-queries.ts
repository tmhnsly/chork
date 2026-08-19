import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { readMany } from "./read";
import { logger } from "@/lib/logger";
import { formatErrorForLog } from "@/lib/errors";
import type { Moment } from "./moments";

type Supabase = SupabaseClient<Database>;

/**
 * Reads for the friends graph.
 *
 * Every one of these goes through a SECURITY DEFINER RPC, because
 * `public.friends` has no Data API grant at all — see migration 104. The
 * table is not reachable from supabase-js even with a valid session,
 * so there is no "and RLS will catch it" fallback to lean on and no
 * way for a component to reach past this module.
 */

/**
 * How the link looks from the caller's side.
 *
 * `direction` is returned by the RPC rather than derived here: the
 * answer depends on `auth.uid()`, which the database knows and a
 * caller would have to be handed.
 */
export type FriendDirection = "active" | "incoming" | "outgoing";

export interface Friend {
  /** The link's own id — what `respondToFriend` needs. */
  friend_id: string;
  /** The other climber. */
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  status: "pending" | "active";
  direction: FriendDirection;
  created_at: string;
}

/**
 * Someone you have shared a Match with and haven't linked to.
 *
 * Matches only, never gym Sets: everyone at your gym shares the
 * current Set, so suggesting from those would be a directory rather
 * than a signal.
 */
export interface FriendSuggestion {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  /**
   * Where the suggestion came from (migration 126). Shown to the
   * climber, because "2 mutual friends" is a claim they can check
   * against their own memory and a bare avatar with an Add button is
   * not. `mutual_friends` outranks `shared_match` — a warmer signal.
   */
  reason: "mutual_friends" | "shared_match";
  /** Mutual friends, or matches shared, depending on `reason`. */
  reason_count: number;
  /** Only set for `shared_match`. */
  last_climbed_at: string | null;
}

/** The suggestion's reason as a line under the name. */
export function suggestionReason(s: FriendSuggestion): string {
  if (s.reason === "mutual_friends") {
    return s.reason_count === 1 ? "1 mutual friend" : `${s.reason_count} mutual friends`;
  }
  return s.reason_count === 1 ? "Climbed together" : `Climbed together ${s.reason_count}×`;
}

/**
 * Active friends and open requests in one call, ordered decisions-first.
 *
 * Declined links are returned to neither side — noise to the person
 * who declined, and an answer we deliberately don't give to the person
 * declined.
 */
/**
 * How the caller stands with one climber — the six-way answer the
 * profile's action row is built on (migration 124). `is_friend` is a
 * boolean and collapses "not asked", "I asked", "they asked" and
 * "declined" into one word, which is four different buttons.
 *
 * A decline is silent to the person declined: they get `none`, the
 * same as never having asked. Only the decliner sees `declined_by_me`.
 */
export type FriendStatus =
  | "self"
  | "none"
  | "sent"
  | "received"
  | "friends"
  | "declined_by_me";

export interface FriendStanding {
  status: FriendStatus;
  /**
   * The friends row, when there is one to act on: what `respondToFriend`
   * takes for Accept. Null in every state with nothing to respond to,
   * and always null to the person who was declined.
   */
  friendId: string | null;
}

export async function getFriendStatus(
  supabase: Supabase,
  userId: string,
): Promise<FriendStanding> {
  const { data, error } = await supabase
    .rpc("friend_status", { p_user_id: userId })
    .maybeSingle();
  if (error || !data) {
    if (error) {
      logger.warn("getfriendstatus_failed", { err: formatErrorForLog(error) });
    }
    // The safe default offers Add, which is idempotent server-side.
    return { status: "none", friendId: null };
  }
  return {
    status: (data.status as FriendStatus) ?? "none",
    friendId: data.friend_id ?? null,
  };
}

export async function getFriends(supabase: Supabase): Promise<Friend[]> {
  return readMany<Friend>(supabase.rpc("get_friends"), "getFriends");
}

export async function getFriendSuggestions(
  supabase: Supabase,
  limit = 10,
): Promise<FriendSuggestion[]> {
  return readMany<FriendSuggestion>(
    supabase.rpc("get_friend_suggestions", { p_limit: limit }),
    "getFriendSuggestions",
  );
}

/**
 * How many people are waiting on you.
 *
 * Drives the nav badge, which used to count pending crew invites.
 * Counted from `getFriends` rather than its own RPC — the list is
 * small, already granted, and a second count function would be a
 * second place for "what counts as pending" to drift.
 */
export async function getPendingFriendRequestCount(
  supabase: Supabase,
): Promise<number> {
  const rows = await getFriends(supabase);
  return rows.filter((r) => r.direction === "incoming").length;
}

/** Split for the UI, which shows the three groups separately. */
export function partitionFriends(friends: Friend[]): {
  active: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
} {
  return {
    active: friends.filter((m) => m.direction === "active"),
    incoming: friends.filter((m) => m.direction === "incoming"),
    outgoing: friends.filter((m) => m.direction === "outgoing"),
  };
}

/**
 * One row of the friends board.
 *
 * `rank` is null for a friend who hasn't scored on this Set yet.
 * They still appear — someone who turned up and hasn't sent anything
 * is more interesting than a gap — but they aren't given a placing.
 */
export interface FriendBoardRow {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  rank: number | null;
  sends: number;
  flashes: number;
  zones: number;
  points: number;
  is_self: boolean;
}

/**
 * You and your friends, ranked on one Set.
 *
 * What a crew was actually for. Set-scoped because points only
 * compare inside one Set — friends at another gym are climbing a
 * different wall on a different reset, and they're served by moments
 * rather than by this.
 */
export async function getFriendsLeaderboard(
  supabase: Supabase,
  setId: string,
  limit = 50,
): Promise<FriendBoardRow[]> {
  return readMany<FriendBoardRow>(
    supabase.rpc("get_friends_leaderboard", {
      p_set_id: setId,
      p_limit: limit,
      p_offset: 0,
    }),
    "getFriendsLeaderboard",
  );
}

/**
 * What your friends have been up to.
 *
 * The only surface that shows you a friend at a different gym: the
 * board is set-scoped, so two friends who share no Set share no board
 * and nothing else in the app would connect them.
 *
 * Derived at read time — see migration 109. Dates only, never clock
 * times; that's enforced in SQL, not here.
 */
export async function getFriendMoments(
  supabase: Supabase,
  limit = 20,
  days = 30,
): Promise<Moment[]> {
  return readMany<Moment>(
    supabase.rpc("get_friend_moments", { p_limit: limit, p_days: days }),
    "getFriendMoments",
  );
}
