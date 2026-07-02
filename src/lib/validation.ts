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

/**
 * Jam code format — six chars from a Crockford-ish alphabet (no I, O,
 * 0, 1) to avoid lookalike confusion on physical sign-in. Matches the
 * `generate_jam_code` helper in migration 041.
 */
export const JAM_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * Gym slug format — lowercase letters / digits separated by single
 * hyphens. Same shape used by the `gyms.slug` column constraint and
 * the user-facing /g/[slug] route. Source of truth so admin signup
 * and future public-listing flows can't drift apart on what counts
 * as a valid slug.
 */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Loose RFC-ish email matcher — non-empty local part, "@", non-empty
 * domain with at least one ".". Deliberately not RFC-5322 strict
 * (which is many lines of grammar): we round-trip the email through
 * Supabase Auth which does its own validation, so this is a
 * client-side reject-obvious-junk guard, not a security gate.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Convenience: returns true if the input is a well-formed UUID. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Grade vote bound check. `null` (no vote) is valid; otherwise the
 * vote must be an integer in 0..30 — matching the DB constraint
 * relaxed in migration 014 (0..30 covers V / Font / points scales).
 * The previous 0..10 clamp pre-dated that relaxation; raw votes
 * 11..30 were rejected app-side even though the DB accepted them.
 */
export function isValidGradeVote(gradeVote: number | null): boolean {
  if (gradeVote === null) return true;
  return Number.isInteger(gradeVote) && gradeVote >= 0 && gradeVote <= 30;
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
