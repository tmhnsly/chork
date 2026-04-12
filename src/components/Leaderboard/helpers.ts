import type { LeaderboardEntry } from "@/lib/data";

/**
 * Adapter: LeaderboardEntry → UserAvatar's expected shape.
 * UserAvatar expects `id` but leaderboard rows carry `user_id`.
 */
export function toAvatarUser(entry: LeaderboardEntry) {
  return {
    id: entry.user_id,
    username: entry.username,
    name: entry.name,
    avatar_url: entry.avatar_url,
  };
}
