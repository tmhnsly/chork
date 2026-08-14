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
 *
 * **Reader-first rule.** A tag lands here in the same change as the
 * `cachedQuery({ tags: [...] })` reader that carries it — never ahead
 * of one. A tag that is only ever busted is a no-op that reads like
 * cache correctness; six such tags (userStats, userCrews, userProfile,
 * crew, userNotifications, userMatches) were retired in 2026-08 after an
 * audit found nothing registered them. `tags.test.ts` pins the rule.
 */

// Each helper returns a specific template-literal type so the
// `Tag` union in `cached.ts` matches without a widening cast. The
// `as const` isn't enough on its own — `(uid: string) =>
// \`user:${uid}:profile\`` infers to plain `string` without an
// explicit return type. Declaring the return inline pins the
// narrow shape.
export const tags = {
  // ── User-scoped ──
  /**
   * The /u/[username] profile surface, keyed by username (the cache
   * key input) — but mutations know the uid. The revalidateUserProfile
   * helper in src/lib/cache/revalidate.ts does the uid → username
   * lookup so the entry actually invalidates on profile-row changes.
   */
  userByUsername: (username: string): `user:username-${string}:profile` =>
    `user:username-${username}:profile`,

  // ── Gym-scoped ──
  /** The currently-live set for a gym; shared across every climber at the gym. */
  gymActiveSet: (gid: string): `gym:${string}:active-set` =>
    `gym:${gid}:active-set`,
  /** Static gym metadata (name, slug, plan tier). */
  gym: (gid: string): `gym:${string}` => `gym:${gid}`,

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

  // ── Competition-scoped ──
  /** Competition metadata + linked gyms + categories. */
  competition: (cid: string): `competition:${string}` => `competition:${cid}`,

  // ── Global (no params) ──
  /** Listed gyms on the /gyms surface. */
  gymsListed: (): "gyms:listed" => "gyms:listed",
} as const;
