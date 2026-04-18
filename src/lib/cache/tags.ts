/**
 * Single source of truth for Next.js cache tag shapes.
 *
 * Every `revalidateTag(...)` call and every `cachedQuery({ tags: [...] })`
 * entry should go through these helpers rather than open-coding the
 * string literal. Three practical benefits:
 *
 *   1. **Grep-ability.** "Which mutations invalidate the user profile
 *      cache?" becomes `grep "tags.userProfile\b"` instead of a
 *      free-text string search.
 *   2. **Typo safety.** `user:${uid}:profile` vs
 *      `user:${uid}:profiles` is a hard-to-spot invalidation bug;
 *      typed constructors prevent it.
 *   3. **Refactor leverage.** If a tag's shape ever changes (e.g.
 *      gaining a gym scope), the rename lands in one place.
 *
 * The mutation → tag map lives in `docs/architecture.md`. Keep both
 * in sync: a new tag here should have a corresponding mutation
 * listed in the doc, and vice versa.
 */

// Each helper returns a specific template-literal type so the
// `Tag` union in `cached.ts` matches without a widening cast. The
// `as const` isn't enough on its own — `(uid: string) =>
// \`user:${uid}:profile\`` infers to plain `string` without an
// explicit return type. Declaring the return inline pins the
// narrow shape.
export const tags = {
  // ── User-scoped ──
  /** The canonical profile row for a given user id. */
  userProfile: (uid: string): `user:${string}:profile` => `user:${uid}:profile`,
  /**
   * Paired alias keyed by username (the /u/[username] surface caches
   * by username, not uid — but mutations know the uid). The
   * revalidateUserProfile helper in src/lib/cache/revalidate.ts
   * busts both shapes on any profile-row change.
   */
  userByUsername: (username: string): `user:username-${string}:profile` =>
    `user:username-${username}:profile`,
  /** Per-user aggregate stats (sends, flashes, points, streak). */
  userStats: (uid: string): `user:${string}:stats` => `user:${uid}:stats`,
  /** Crew memberships for the user (authored + invited). */
  userCrews: (uid: string): `user:${string}:crews` => `user:${uid}:crews`,
  /** Notification inbox count / list for the user. */
  userNotifications: (uid: string): `user:${string}:notifications` =>
    `user:${uid}:notifications`,
  /** Jam history for the user. */
  userJams: (uid: string): `user:${string}:jams` => `user:${uid}:jams`,

  // ── Gym-scoped ──
  /** The currently-live set for a gym; shared across every climber at the gym. */
  gymActiveSet: (gid: string): `gym:${string}:active-set` =>
    `gym:${gid}:active-set`,
  /** Static gym metadata (name, slug, plan tier). */
  gym: (gid: string): `gym:${string}` => `gym:${gid}`,
  /**
   * All-time gym aggregates (chorkboard strip). Reserved for a future
   * cache wrap on the all-time `get_gym_stats_v2_cached` variant; the
   * tag is typed now so the Tag union stays exhaustive.
   */
  gymStatsAllTime: (gid: string): `gym:${string}:stats-all-time` =>
    `gym:${gid}:stats-all-time`,

  // ── Set / route-scoped ──
  /** Set leaderboard top-N + neighbourhood cache. */
  setLeaderboard: (sid: string): `set:${string}:leaderboard` =>
    `set:${sid}:leaderboard`,
  /** Full route list for a set. */
  setRoutes: (sid: string): `set:${string}:routes` => `set:${sid}:routes`,
  /** Community grade average for a route (cached via get_route_grade RPC). */
  routeGrade: (rid: string): `route:${string}:grade` => `route:${rid}:grade`,
  /**
   * Comments attached to a route. Added in the Phase-2 sweep so a
   * comment mutation can bust the per-route comments cache (instead
   * of the `revalidatePath("/crew")` scorch-the-earth previously used).
   */
  routeComments: (rid: string): `route:${string}:comments` =>
    `route:${rid}:comments`,

  // ── Crew-scoped ──
  /** Crew metadata + roster. */
  crew: (cid: string): `crew:${string}` => `crew:${cid}`,

  // ── Competition-scoped ──
  /** Competition metadata + linked gyms + categories. */
  competition: (cid: string): `competition:${string}` => `competition:${cid}`,

  // ── Global (no params) ──
  /** Listed gyms on the /gyms surface. */
  gymsListed: (): "gyms:listed" => "gyms:listed",
} as const;
