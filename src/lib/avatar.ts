import type { Profile } from "./data/types";

/**
 * Get the avatar URL for a user profile.
 * Uses avatar_url if set, falls back to DiceBear initials.
 */
export function getAvatarUrl(
  user: Pick<Profile, "id" | "avatar_url" | "name" | "username">,
  options?: { size?: number }
): string {
  if (user.avatar_url) {
    return user.avatar_url;
  }

  const seed = encodeURIComponent(user.name || user.username || user.id);
  const size = options?.size ?? 128;
  return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}&size=${size}&backgroundColor=6366f1`;
}
