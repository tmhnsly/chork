# ADR 0003 — Keep targeted `require*` auth helpers; no `getUserRoles` aggregator

**Status:** Accepted, 2026-05-21
**Context links:** session that proposed it (architecture-improvement skill, opportunity #4)

## Decision

We do **not** consolidate the four `require*` auth helpers (`requireGymAdmin`, `requireCompetitionOrganiser`, `requireCompetitionOrganiserOrGymAdmin`, `requireAdminOfSet/Route`) behind a single `getUserRoles(userId)` aggregator.

The targeted helpers stay. When two roles need to be queried in one place, we add a focused composite (already done for `requireCompetitionOrganiserOrGymAdmin`) rather than a global "fetch every role" call.

## Why

The audit proposed a `getUserRoles(userId)` that returns a `Set<string>` for each of the three orthogonal role systems. The intent: one cache-hit per request, expressive `canManageX` predicates layered on top.

Two reasons we don't do this today:

1. **Per-request over-fetching.** Most pages only need to verify one role (admin gate on a single gym, or organiser gate on a single competition). `getUserRoles` would pull every role the user has across every gym + every competition + every membership, even when 99% of the result is thrown away. The targeted helpers fetch only what the surface needs.
2. **No real composite friction today.** The only legitimately-composite question — "can manage this competition AND/OR admin this gym" — already has a named helper (`requireCompetitionOrganiserOrGymAdmin`). New composites can be added one helper at a time. The three role systems remain orthogonal in code because each helper checks one thing well.

`CONTEXT.md` already encodes the "never conflate them" rule. The helper surface enforces it: each `require*` answers exactly one question.

## How to apply

- A new composite role question appears? Add a focused helper next to `requireCompetitionOrganiserOrGymAdmin`, not a generic aggregator.
- A page needs to know "is the caller admin of *any* gym"? Add `requireAnyGymAdmin()` — still scoped, still doesn't pull every role.
- Avoid fetching role data the surface doesn't immediately need; the cost is real at hot paths (middleware, server-component renders).

## Counter-evidence that would reopen this

- A page legitimately needs three or more roles in one render (e.g. "show all gym admin badges, all organiser badges, and all set creator badges in a single grid"), AND the targeted-helpers approach forces three round-trips that show up in a perf trace. Today no page does this.
