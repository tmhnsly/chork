/** Username format: lowercase alphanumeric + underscores, 3–24 chars. */
export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export function validateUsername(username: string): { error?: string } {
  if (!username) return { error: "Username is required" };
  if (username.length < 3) return { error: "Username must be at least 3 characters" };
  if (username.length > 24) return { error: "Username must be 24 characters or fewer" };
  if (!USERNAME_RE.test(username)) return { error: "Lowercase letters, numbers, and underscores only" };
  return {};
}
