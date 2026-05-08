import type { LeaderboardEntry } from "./types";

/**
 * Adapter: LeaderboardEntry → UserAvatar's expected shape.
 * UserAvatar expects `id` but leaderboard rows carry `user_id`.
 *
 * Lives in lib/data so cross-feature surfaces (Leaderboard,
 * Competitions, future jam/crew leaderboards) can render avatars from
 * leaderboard rows without reaching into another feature's folder.
 */
export function toAvatarUser(entry: LeaderboardEntry) {
  return {
    id: entry.user_id,
    username: entry.username,
    name: entry.name,
    avatar_url: entry.avatar_url,
  };
}
