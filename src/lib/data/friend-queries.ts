import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { readMany } from "./read";

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
  shared_matches: number;
  last_climbed_at: string | null;
}

/**
 * Active friends and open requests in one call, ordered decisions-first.
 *
 * Declined links are returned to neither side — noise to the person
 * who declined, and an answer we deliberately don't give to the person
 * declined.
 */
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
