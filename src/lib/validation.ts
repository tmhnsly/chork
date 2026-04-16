/** Username format: lowercase alphanumeric + underscores, 3–24 chars. */
export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/**
 * RFC-4122 UUID matcher. Used by every server action that takes an id
 * from a form payload — gates the value before it touches Postgres.
 *
 * Single source of truth: previously duplicated literal in 6+ files,
 * any tweak (e.g. accepting v7 ULIDs) had to be changed everywhere.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Convenience: returns true if the input is a well-formed UUID. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Escape Postgres LIKE / ILIKE pattern metacharacters in a user-supplied
 * search input. Without this, a climber typing "50%" turns into a
 * wildcard scan; "_a" matches every two-letter combo starting with "a".
 *
 * Backslash itself escapes (default Postgres behaviour) so we double it
 * first, then escape the wildcards.
 */
export function escapeLikePattern(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

export function validateUsername(username: string): { error?: string } {
  if (!username) return { error: "Username is required" };
  if (username.length < 3) return { error: "Username must be at least 3 characters" };
  if (username.length > 24) return { error: "Username must be 24 characters or fewer" };
  if (!USERNAME_RE.test(username)) return { error: "Lowercase letters, numbers, and underscores only" };
  return {};
}
