# Context

Domain language for Chork. Reference vocabulary used by architecture
discussions and skills like `improve-codebase-architecture`.

CLAUDE.md is the authoritative source for project rules. Architectural
deep-dives live in `docs/architecture.md`. This file holds **terminology**
that needs a single canonical definition.

---

## Set

A gym's numbered batch of routes for a period. Carries `status`
(`draft` / `live` / `archived`) — **write `status`, never the legacy
`active` boolean**, which a migration-003 trigger derives from it so
older readers keep working. **One live Set per gym**: app-enforced in
`createSet` and in `updateSet`'s go-live branch (both archive the
incumbent first), not a DB constraint. A Set owns its grading scale
and max grade, so the climber-side grade slider reads from the Set,
not from global config.

## Route log

One climber's record on one Route: `attempts`, `completed`, `zone`.
The atom the whole scoring system is built from. **Points are never
stored** — always derived via the Scoring ladder. Flash is likewise
derived (`attempts === 1 && completed`), never a column. See
[Attempt privacy](#attempt-privacy) for what may be shown to whom.

## Jam

A self-organised competition that needs no gym — at a gym, outdoors,
on a home wall. **Jams are the baseline product, not a lesser Set**:
a climber with no gym is a first-class user, so never write code that
assumes `profile.active_gym_id` (use `requireSignedIn` /
`gateSignedInMutation`, not `requireAuth`).

Structurally a Jam **parallels** a Set — routes, logs, a leaderboard,
a log sheet — but shares no tables with one (`jam_logs` vs
`route_logs`, `jam_routes` vs `routes`). That parallelism is
deliberate and load-bearing: a Jam is ephemeral and collapses into a
`jam_summaries` row when it ends, whereas a Set's logs are permanent
history. The duplication it causes is therefore expected in the data
layer, and expected NOT to appear in the presentation layer — shared
visual language (tile states, `LeaderboardRow`) is factored into
`components/ui`. Where the two must agree numerically (the Scoring
ladder, rank/tiebreak order) they are pinned by
`scoring-parity.test.ts` rather than merged.

## Wall vs Chorkboard

Two distinct gym surfaces, easy to conflate in conversation. The
**Wall** is the punch-card grid of the current Set — where a climber
logs. The **Chorkboard** is the gym-wide public leaderboard — where
standings are read. Both are gym-scoped and therefore both are
*optional*: a gymless climber sees neither, and `/` and `/leaderboard`
redirect to `/jam`.

## Crew

A private group with a mutual membership row both sides agreed to.
Crews replaced follows entirely (migrations 020 + 021) — **there is
no asymmetric social relationship anywhere in the app**. Any
`follower_count` / `getFollowers` reference is dead and should be
deleted on sight.

## Climber, admin, organiser

Three orthogonal roles, never to be conflated:

- **Climber membership** — `gym_memberships`. Its `role` column is
  cosmetic; **never gate UI on it** (the home page shipped that bug
  once).
- **Gym admin** — the separate `gym_admins` table, read via
  `is_gym_admin()` / `isGymAdminOf()` / `requireGymAdmin()`.
- **Competition organiser** — `competitions.organiser_id`, gated by
  `is_competition_organiser()`. Spans gyms the organiser may not
  admin, which is why it can't fold into gym admin.

Leaving a gym **parks** the membership rather than severing it:
`route_logs` SELECT is gated on `is_gym_member(gym_id)`, so dropping
the row would make a climber's own history unreadable to them.

---

## Notification

A per-recipient social event. Has two coordinated effects:

1. **Persistent log row** in `notifications` table — survives missed
   pushes, surfaces via the bell + `NotificationsSheet`.
2. **Push** dispatch (best-effort, deferred via `after()`) — opt-out
   filtered by category column on `profiles`.

(No cache bust: the inbox is read via an uncached server action, so
there is no tagged entry to invalidate — reader-first rule in
`src/lib/cache/tags.ts`. A third effect returns here if the inbox
ever gains a `cachedQuery` reader.)

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
edit in each home — and since 2026-08 the pairing is machine-checked:
`src/lib/data/scoring-parity.test.ts` evaluates the TS ladder against
the latest SQL definition (and pins every leaderboard RPC's
rank/tiebreak clause), so a one-sided edit fails the suite instead of
silently forking the formula.

Known, deliberate rank divergence: `end_jam` writes summary ranks
with `row_number()` (arbitrary tie order) while every live board uses
`dense_rank()`. Tie handling in jam summaries is a product decision
parked with the jams overhaul (docs/roadmap.md).

## Attempt privacy

Raw attempt counts are owner-only. "Raw" means two different things
at two different grains, so the contract is **two collapses, not
one** — reading it as a single rule is how it gets implemented wrong.

**Aggregate grain** — a player's total attempts across a jam
(`sum(attempts)`, `jam_summary_players.attempts`). Masked to `0` for
everyone but the owner, in SQL. It has no display role and no
derivation role for a viewer, so it is simply withheld. Lives inline
in the live definitions of `get_jam_leaderboard` and
`get_jam_summary_for_user`; `get_jam_state_for_user` inherits it by
sourcing its leaderboard from the former rather than re-deriving.

**Per-log grain** — one climber, one route. Collapsed to the buckets
`{0, 1, 2}` by `visibleAttempts()` in `src/lib/data/logs.ts`:
flash → 1, non-flash completion → 2, uncompleted → 0. It cannot be
withheld the way the aggregate is, because **tile state**
(empty / attempted / flash / completed) is derived from it and
**flash is public** — it's a column on every leaderboard, rendered
with a bolt. Every non-flash completion collapses to the same value,
so 2 tries and 40 tries are indistinguishable; uncompleted collapses
to 0 so there is no "currently working this route" signal (the same
activity-leak concern behind `relativeDay`'s coarse timestamps).

The strongest form of the contract is to ship neither: `SanitisedLog`
in `src/app/leaderboard/actions.ts` sends `is_flash` / `has_attempts`
and drops `attempts` entirely, so the number never crosses the wire.
Prefer that shape for any NEW surface handing one climber's logs to
another's browser.

**Known accepted weakness.** Jam realtime ships `jam_logs` with
`REPLICA IDENTITY FULL`, so other players' raw per-log counts do
reach the browser and are collapsed client-side, in
`jamScreenReducer`'s `upsert-log`. Migration 056 accepted this
deliberately: the RPC mask plus the client collapse are documented
there as a defence-in-depth pair, and the value is never rendered.
Reopen only with a filtered publication or realtime RLS — not by
moving the client collapse around.

Both grains are pinned by `src/lib/data/attempt-privacy.test.ts`.
The SQL mask has been dropped and re-fixed twice already (migrations
052 and 056, both caught by review rather than by a test), which is
why the pin reads the *live* definition — `create or replace` means
the last definition in filename order wins.

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
