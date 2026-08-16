# Context

Domain language for Chork. Reference vocabulary used by architecture
discussions and skills like `improve-codebase-architecture`.

CLAUDE.md is the authoritative source for project rules. Architectural
deep-dives live in `docs/architecture.md`. This file holds **terminology**
that needs a single canonical definition.

> **Vocabulary is ahead of the code (decided 2026-08-14).** The terms
> below are the agreed product language; the codebase still says
> `match*` / "Wall" / "Crew" in places and will until the convergence
> work in `docs/roadmap.md` lands. Where they differ, this file is the
> target and the code is the lag. Don't "correct" this file back.

---

## Set

**The general term: any numbered collection of routes you score
points on.** Two kinds, which differ only in who runs it and how long
it lives — not in what it is:

- **Gym Set** — run by a gym, set by its setters, any length (a week,
  a season). The thing gyms pay for.
- **Match** — run by climbers themselves. See below.

Every Set **ends with a winner**, who gets a trophy on their profile;
anyone who took part sees their placement when it closes.

A gym Set carries `status` (`draft` / `live` / `archived`) — **write
`status`, never the legacy `active` boolean**, which a migration-003
trigger derives from it so older readers keep working. **One live Set
per gym**: app-enforced in `createSet` and in `updateSet`'s go-live
branch (both archive the incumbent first), not a DB constraint. A Set
owns its grading scale and max grade, so the climber-side grade
slider reads from the Set, not from global config.

## Match

**A Set climbers run themselves** — at a gym, outdoors, on a home
wall. Started by anyone, joined with a 6-character code, scored the
same way as a gym Set.

The name works twice over: a match is a contest with players and a
winner, and matching is putting both hands on the same hold. Legible
to a newcomer, a wink to a climber. (It replaces "Match", dropped
because it named a crack technique and implied a session rather than
a competition.)

**Matches are the baseline product, not a lesser Set.** A climber
with no gym is a first-class user, so never write code that assumes
`profile.active_gym_id` (use `requireSignedIn` /
`gateSignedInMutation`, not `requireAuth`). They are also the growth
engine: a Match is the thirty seconds in which one climber recruits
another, so joining must stay near-frictionless — see the guest model
in the roadmap.

A Match can be **promoted to a gym Set** — that upgrade path is why
the two are one primitive rather than two systems.

## Discipline

Boulder / sport / top-rope — Chork is not boulder-only.
*(Shipped 2026-08-15, migrations 091–093.)*

**Set at the Set level as a default, overridable per route.** A gym
admin picks one for the whole Set; a climber logging an outdoor day
mixes freely within one Match.

Discipline changes **which grade scale is offered** (V / Font for
boulders, YDS / French for ropes) and **what partial credit is
called** (a boulder's zone is a rope's highpoint — same `zone`
column throughout, it is a display name and not a second concept).

Note `french` (sport: 6a, 6a+) is a **different system** from `font`
(boulder: 6A, 6A+) despite the resemblance. Case is the only thing
telling them apart on screen, so never normalise it —
`grade-label.test.ts` pins that.

Stored as a default on the Set and a nullable override on the route,
where null means inherit. A route agreeing with its Set is normalised
back to null by a trigger, so changing a Set's discipline still moves
every route that never disagreed. It does **not**
change scoring: `computePoints` reads `attempts`, `completed`,
`zone` and never grade, so a V4 boulder and a 6a+ route already share
one points total with no equivalence to invent. Keep it that way —
the moment scoring forks per discipline, every game mode has to be
built three times.

Two places discipline genuinely bites:

- **Handicap** needs a ceiling *per discipline*. A V6 boulderer is
  not a 6a rope climber.
- **Grade distributions** must never mix scales across disciplines —
  a pyramid per discipline, never a 6a+ rendered as a V-grade.

## Guest players

A **guest** is a named seat in a Match with no account — no sign-in,
no profile, nothing to claim. The host adds a name and enters that
person's sends.

**Why not an account.** Supabase anonymous auth was the other
candidate (a real `auth.users` row, claimable later). It was rejected
because an account that self-reports onto a leaderboard is trivially
minted by anyone holding the join code. Having the host enter the
sends puts a real, accountable person behind every number.

**Matches only.** The gym leaderboard is for signed-in gym members. A
guest's log carries no `gym_id` and belongs to a climber-owned Set, so
it cannot reach the gym board or `user_set_stats` by construction —
not by a filter someone has to remember.

Identity is the SEAT (`set_players.id`), which is the only thing both
kinds of player have. An account-backed seat owns its logs by
`user_id`, a guest's by `route_logs.player_id`; `ownerIdOf()` in
`match-types.ts` resolves both to one string for client code.

A guest's attempts never leave the database on the board — there is no
account to own them. The host reads them from `guest_logs` in the room
bundle, since they typed them in.

## Handicap

Optional scoring lens that lets climbers of different abilities share
a leaderboard: a send scores relative to the climber's own ceiling,
so everyone competes against themselves.

**The rule** (settled 2026-08-15, measured not guessed): a send
counts at full value when the route is at or above your declared
ceiling, ×0.7 one grade below, ×0.4 two below, and **nothing** more
than two below.

That cutoff is the balance mechanism. A stronger climber doesn't
out-score a weaker one per route — on a route both can flash, both
score 4 — they win on VOLUME, because every route below their limit
is another route they can add. Any tail at all re-tilts the board.
Simulated over a V0–V6 session, V2 climber vs V6 climber:

| taper | V2 | V6 | ratio |
|---|---|---|---|
| 1 / .7 / .4 / .2, floor .1 | 4.7 | 6.7 | 1.43 |
| 1 / .7 / .4 / .15 | 4.7 | 5.3 | 1.13 |
| 1 / .7 / .4, then nothing | 4.7 | 4.7 | **1.00** |

Sending ABOVE your ceiling is capped at full value, never bonused —
a bonus there makes declaring low strictly better than being honest.

It is a lens OVER `computePoints`, never a second ladder: base points
first, then one multiplier. Two homes (`handicap.ts`,
`handicap_multiplier` in SQL), pinned together by
`scoring-parity.test.ts` for the same reason `compute_points` is.

**Known hole:** ceilings are self-declared, and declaring low is
still worth points — your band fills with routes you flash. The fix
is a ceiling *suggested from what you've actually been sending*,
which needs history to exist first. Until then this is a handicap for
climbing with mates who can see what you climbed, not a defence
against an adversary. Auto-raising the ceiling mid-Match was
considered and rejected: it punishes the upset, since a V2 climber
who sends a V4 would have their earlier sends fall out of band and
score LESS for climbing better.

**Ceilings live per Match, not on the profile** — a ceiling only
means something alongside a scale, and a Match has exactly one. On
the profile it would need a (discipline, scale, grade) triple and a
conversion at read time, and there is no honest conversion between a
V-grade and a French one.

**Matches only — never gym Sets.** A gym Set carries the gym's name
and eventually prizes, so its scoring has to be comparable and
ungameable; handicap is self-declared and inherently soft.

## Card, Ranks, Chorkboard

- **Card** — a climber's scorecard for the Set they're on: the grid
  of numbered routes they tick. (Was "the Wall", which competed with
  the physical wall they're standing at.)
- **Ranks** — the navigation label for standings.
- **Chorkboard** — the brand name for a gym's public leaderboard.
  Brand names may be invented; navigation labels may not.

Card and Ranks are the same context ("my gym, right now") and share
one nav entry. **Not tabs** — that was the plan until the design
session (2026-08-16) landed somewhere better.

The problem with tabs: behind one, you log a send and nothing on
screen says it mattered. The two things are only interesting
*together*, so the Card carries a one-line **rank strip** — `#41 of
51 · 8 pts` — that moves the moment you log, showing places gained
since you opened the screen. Tapping it opens the full Chorkboard,
which keeps everything it had.

They also aren't peers: you log sends constantly and check standings
occasionally. The strip matches that, and it costs one indexed lookup
plus the cached gym-stats RPC — no board is fetched to render it.

Rank can't be derived client-side (it depends on everyone else) and
`completeRoute` busts cache tags rather than re-rendering the page, so
the strip asks the server after a debounced burst of logging. See
`GymScreen`, which exists solely to hold that wire.

Nav went from six entries to five, one over the HIG's limit for
anyone who runs a gym.

## Chork (the game mode)

HORSE, on a wall. Designed 2026-08-16.

A Match with `game_mode = 'chork'`. Same container, same routes, same
logs — only the win condition differs, which is what "one engine"
means in the roadmap.

**A round.** The setter puts up a route and sends it; the attempts
their log records become **N**. That is the challenge: everyone else
has N attempts to send the same route. You are safe if and only if
you sent it in N or fewer. Otherwise you take a letter — C, H, O, R,
K — and five letters puts you out. Last climber standing wins.

**The pen.** The setter keeps setting while they keep sending their
own challenges. It only passes when they fail to send one, and a
failed set is not a round: nobody takes a letter from it. That is the
tension of the game — a climber on a streak dictates, and the only
brake is their own reach.

**Mixed abilities.** Reuses the ceiling climbers declare for the
handicap: a challenge above your limit buys one extra attempt per
grade above it. Scaling the *allowance* is the only lever Chork has,
since it has no points to scale. Off entirely when nobody has
declared a ceiling.

**Letters are derived, never stored.** Same rule as points. A round is
a route plus its `added_by` setter plus that setter's own log; a
player's letters are the rounds they failed. Failure is
`attempts >= allowance AND NOT (completed AND attempts <= allowance)`
— written that way on purpose, so a climber who keeps pulling after
their allowance runs out and eventually sends does **not** erase the
letter they already earned.

## Mates

The social graph: climbers you follow, mutually. Replaces **Crew**,
which required creating a group and waiting for invites to be
accepted — three steps before any value, and every crew empty at
launch. A follow gives value at one connection.

The feed shows **moments, not ticks**: a first V6, a project sent
after five sessions, a flash above someone's usual grade, a Set won.
"Tom sent #14" is noise.

Crews replaced follows entirely in migrations 020 + 021, so any
`follower_count` / `getFollowers` reference from *before* that is
still dead code — the new graph is a fresh design, not a revival.

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
standings, match leaderboard, `user_set_stats`) derives from one of
these two; nothing else may inline the ladder. A scoring change is one
edit in each home — and since 2026-08 the pairing is machine-checked:
`src/lib/data/scoring-parity.test.ts` evaluates the TS ladder against
the latest SQL definition (and pins every leaderboard RPC's
rank/tiebreak clause), so a one-sided edit fails the suite instead of
silently forking the formula.

**Resolved 2026-08-15.** There used to be a deliberate rank
divergence here: `end_jam` wrote summary ranks with `row_number()`
(arbitrary tie order) while every live board used `dense_rank()`, so
a tied session disagreed with itself depending on the screen. The Set
convergence removed the summary entirely — a finished Match is an
archived Set that keeps its rows — and `match_standings` (migration
085) is the single ranking behind the live board, history and the
shared result card alike. `scoring-parity.test.ts` pins it to the
same clause as `get_match_leaderboard`.

## Attempt privacy

Raw attempt counts are owner-only. "Raw" means two different things
at two different grains, so the contract is **two collapses, not
one** — reading it as a single rule is how it gets implemented wrong.

**Aggregate grain** — a player's total attempts across a Match
(`sum(attempts)`). Masked to `0` for everyone but the owner, in SQL.
It has no display role and no derivation role for a viewer, so it is
simply withheld. Lives inline in the live definition of
`get_match_leaderboard`, resolved against `v_viewer` so the
service-role path masks against a real person rather than nobody;
`get_match_state_for_user` inherits it by sourcing its leaderboard
from that RPC rather than re-deriving.

The public result card goes further: `get_public_match_result`
doesn't return `attempts` at all. There is no viewer to mask against
on a page anyone with the link can read, so the column simply never
leaves the database.

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

**Known accepted weakness.** Match realtime ships `match_logs` with
`REPLICA IDENTITY FULL`, so other players' raw per-log counts do
reach the browser and are collapsed client-side, in
`matchScreenReducer`'s `upsert-log`. Migration 056 accepted this
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
