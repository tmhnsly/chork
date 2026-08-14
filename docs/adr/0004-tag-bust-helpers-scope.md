# ADR 0004 — Tag-bust helpers extract only for non-obvious coupling

**Status:** Accepted, 2026-05-21. **Amended 2026-08-14** — see addendum at the end: the premise behind `revalidateRouteLogTags`' two-tag coupling turned out to be half-phantom, and `revalidateCrewMembers` was deleted outright.
**Context links:** session that proposed it (architecture-improvement skill, round 2)

## Decision

We extract a tag-bust helper into `src/lib/cache/revalidate.ts` only when **multiple tags must be busted together** and the coupling is non-obvious from the call site. Single-tag busts stay inline.

Today this gives us two helpers:

- `revalidateUserProfile(supabase, userId)` — busts `user:{uid}:profile` AND `user:username-{u}:profile` (the by-username variant needs a profile lookup; callers that only know uid would forget it).
- `revalidateRouteLogTags(setId, userId)` — busts `set:{id}:leaderboard` (conditional on setId) AND `user:{uid}:stats` together; every route-log mutation needs both.

We **do not** extract:

- A `revalidateCommentMutation(routeId)` helper that wraps a single `revalidateTag(tags.routeComments(routeId), "max")` call. One tag, two call sites, zero semantic invariant to preserve.

## Why

The architecture-improvement skill flagged tag-bust scattering as friction. Looking at the actual surface:

- Route-log mutations (`completeRoute`, `uncompleteRoute`) repeat a 4-line conditional pair (`if (log.set_id) revalidateTag(...); revalidateTag(userStats(...))`). The coupling between the two busts is a real semantic invariant — a new route-log mutation that forgets one is a 60-second window of stale UI with no test signal. **The helper earns its keep here.**

- Comment mutations (`postComment`, `editComment`) each invoke `revalidateTag(tags.routeComments(routeId), "max")` — a single line. Wrapping it in `revalidateCommentMutation` saves nothing and adds a layer of indirection. **No helper here.**

The signal is "are you coupling tags whose together-ness is non-obvious?" not "do two callsites repeat the same line?"

## How to apply

- Multi-tag bust where the set is a semantic invariant → extract a named helper in `revalidate.ts`.
- Single-tag bust, or multi-tag bust where the set genuinely differs per mutation → inline at the call site.
- Conditional sub-tag (like `setId`-or-null) → keep the conditional inside the helper, not at every call site.

## Counter-evidence that would reopen this

- The route-comments tag accumulates a sibling (e.g. a `route:{id}:reactions` tag that also needs busting on comment mutations). The set-of-tags-to-bust grows past 1, the coupling becomes non-obvious, helper earns its keep.

## Addendum (2026-08-14) — the reader-first correction

An architecture audit checked every tag this ADR reasons about against
the actual `cachedQuery` registrations and found the invariant this
ADR protects was partly phantom:

- `user:{uid}:stats` — busted by `revalidateRouteLogTags`, **never
  registered on any cached read**. The "60-second window of stale UI"
  this ADR cites could not occur; per-user stats are read uncached by
  design (they vary per caller). The bust was retired.
- `crew:{id}` + `user:{uid}:crews` — same: no reader anywhere, and
  `revalidateCrewMembers` performed a live `crew_members` SELECT per
  crew mutation purely to fan out no-op busts. The helper was deleted.

What survives, and why:

- **`revalidateRouteLogTags(setId, userId)` stays** — with one live
  tag (`set:{id}:leaderboard`, conditional on `setId`). This ADR's
  "keep the conditional inside the helper" rule carries it, and the
  helper is deliberately kept as the seam where a future per-user
  stats cache re-adds its tag in one edit. The `userId` parameter is
  retained (unused) for that reason.
- **`revalidateUserProfile` stays** — its real work was always the
  uid → username lookup feeding the `user:username-{u}:profile` bust;
  the dead `user:{uid}:profile` line was dropped.

New rule, enforced by `src/lib/cache/tags.test.ts`: **a tag may only
exist alongside a live cached reader** (reader-first). The decision
procedure in "How to apply" now has a step zero: before reasoning
about whether coupled busts deserve a helper, verify each tag in the
set actually has a `cachedQuery` registration — coupling between
no-ops is not coupling.
