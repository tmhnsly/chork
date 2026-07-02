# Context

Domain language for Chork. Reference vocabulary used by architecture
discussions and skills like `improve-codebase-architecture`.

CLAUDE.md is the authoritative source for project rules. Architectural
deep-dives live in `docs/architecture.md`. This file holds **terminology**
that needs a single canonical definition.

---

## Notification

A per-recipient social event. Has three coordinated effects:

1. **Persistent log row** in `notifications` table — survives missed
   pushes, surfaces via the bell + `NotificationsSheet`.
2. **Push** dispatch (best-effort, deferred via `after()`) — opt-out
   filtered by category column on `profiles`.
3. **Cache bust** of `user:{recipient}:notifications`.

Every notification has a single recipient, an `actor` (the user whose
action triggered it), and a category. When `actor === recipient` the
dispatch is a no-op (self-skip). Implemented by `notify(event)` in
`src/lib/notify.ts`.

Examples: `crew_invite_received`, `crew_invite_accepted`,
`crew_ownership_transferred`. Future: comment likes, friend requests.

## Notification kind

The per-kind identity of a Notification: its payload shape, its push
copy, and its in-app copy, co-located in one definition-table entry in
`src/lib/data/notification-kinds.ts` (same shape as the error-copy
tables in `src/lib/errors.ts`). `notify()` renders push copy from the
table; `NotificationsSheet` renders in-app copy from the same entry.
Adding a kind = one table entry + the DB check constraint (migration
033). The kind union is derived from the table keys, so a missing
entry is a type error, not a runtime fallback.

## Scoring ladder

The points formula: flash = 4, 2-try = 3, 3-try = 2, 4+-try = 1,
incomplete = 0, plus 1 if zone. One concept, two canonical homes —
`computePoints()` in `src/lib/data/logs.ts` (TypeScript) and
`public.compute_points(attempts, completed, zone)` (SQL, migration
063). Every scoring surface (Chorkboard, crew leaderboard, competition
standings, jam leaderboard, `user_set_stats`) derives from one of
these two; nothing else may inline the ladder. A scoring change is one
edit in each home.

## Announcement

A broadcast push with no per-recipient log row, no opt-out category,
fan-out to N users. Different shape from a Notification — kept
deliberately separate.

Implemented by `announce(message)` in `src/lib/announce.ts`. Caller
hands over `{ userIds, title, body, url? }`; the helper schedules a
best-effort background push and swallows any failure. Use this for
gym-wide events (sets going live, competition start, season finale);
use `notify()` for per-recipient social events that need a log row.

Current callers:
- Set `draft → live` transition in `src/app/admin/sets-actions.ts` —
  fan-out to every climber with activity at that gym.
