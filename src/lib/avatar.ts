/**
 * Get the avatar URL for a user. Falls back to a DiceBear identicon
 * seeded by the user's ID for a consistent default avatar.
 */
export function getAvatarUrl(
  user: { id: string; collectionId: string; avatar?: string; name?: string; username?: string },
  options?: { thumb?: string }
): string {
  if (user.avatar) {
    const thumb = options?.thumb ? `?thumb=${options.thumb}` : "";
    return `${process.env.NEXT_PUBLIC_POCKETBASE_URL}/api/files/${user.collectionId}/${user.id}/${user.avatar}${thumb}`;
  }

  // DiceBear identicon as default — deterministic, no signup needed
  const seed = encodeURIComponent(user.id);
  const size = options?.thumb ? parseInt(options.thumb) : 128;
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.name || user.username || user.id)}&size=${size}&backgroundColor=6366f1`;
}
