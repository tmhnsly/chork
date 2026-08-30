# League — design

*2026-08-30. Decisions from a brainstorm with Tom; the why is in
`docs/strategy.md` ("The missing primitive").*

## What it is

A **League** is a series of Matches with a cumulative table. This
slice builds the **friend-group fixture** — "our Tuesday league" — end
to end. The gym weekly social and the gym season reuse the same table
and RPCs later; they need an admin surface, not a new model.

A League is a *fixture*: the thing that turns a one-off Match into a
reason to come back next week.

Vocabulary (to be added to CONTEXT.md when built):

- **League** — the series. Has a host, a name, a table.
- **Week** — one finished Match that belongs to the League. Called a
  week in copy because that is what it is for a friend group; the
  column is `sets.league_id`.
- **Table** — the League's standings.

## Not in this slice

- Gym-owned Leagues (admin UI, pg_cron publish, multi-site).
- Push, achievements, a moments-feed event for a League.
- Organiser-pays / Stripe. The payer/free split is a `leagues`
  column when it comes; nothing here precludes it.
- Linking guests across weeks.

## Rules

**A week pays placement points.** Each finished Match's board is
ranked the way it already is (`match_standings`: points → flashes →
sends → earliest last send; handicap folds in). A Chork-mode week
ranks by `chork_standings`: fewest letters first, seats that are out
last, ties broken by the same order as above. Placement pays a fixed
ladder:

| Place | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th+ |
|---|---|---|---|---|---|---|---|---|
| Points | 10 | 8 | 6 | 5 | 4 | 3 | 2 | 1 |

Turning up scores. Tied places (the board already dense-ranks) share
the higher value: two climbers tied 2nd both take 8 and the next is
3rd. A week you did not play is 0.

**Guests place but get no row.** A guest seat takes its placing and
pushes account-holders down in that week, and never appears in the
table. The table is the reason to make an account.

**Best N−1 of N from four weeks; N−2 from eight.** With 1–3 weeks
every result counts. From 4, your lowest week is dropped; from 8,
your lowest two. Not configurable — one rule everyone can hold.

**The table ranks by** total after drops, then most 1st places, then
most 2nds, and so on; still tied → shared place.

**Roster** = every account-holder who played at least one week. No
join step, no invites at the League level — you are in the League by
climbing in it.

**A Match belongs to at most one League.** Only finished Matches
count; a live Match stamped with a `league_id` shows on the League
screen as "this week, in progress" and joins the table when it ends.

**Host-only writes:** create, rename, add a finished Match, remove a
week, end the League. Only Matches the host hosted can be added; a
League's host is the host of its first Match. **Anyone on the roster
(or the host) can read.**

## Data

Migration 133.

```sql
create table public.leagues (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);
alter table public.sets add column league_id uuid references public.leagues(id) on delete set null;
create index sets_league_id_idx on public.sets (league_id) where league_id is not null;
```

RLS on, **no Data API grant** — the `friends` pattern. Every read and
write is a SECURITY DEFINER RPC, so the host-only rules live in one
auditable place and the table is unreachable from supabase-js.

`gym_id` is left off `leagues` deliberately; the gym slice adds an
`owner_kind` pair the way `sets` has one, in its own migration.

### RPCs (all `security definer`, `set search_path = ''`)

Writes (`auth.uid()` must be the host; each returns the league id or
raises):

- `create_league(p_name text, p_set_id uuid)` — from a finished Match
  the caller hosted; stamps it as the first week.
- `rename_league(p_league_id uuid, p_name text)`
- `add_match_to_league(p_league_id uuid, p_set_id uuid)` — finished,
  caller-hosted, not already in a League.
- `remove_match_from_league(p_league_id uuid, p_set_id uuid)` — nulls
  the column; the Match itself is untouched.
- `end_league(p_league_id uuid)` — sets `ended_at`; an ended League
  accepts no more weeks and "Start this week" disappears.

Reads (raise `not found` for a caller who is neither host nor on the
roster — the two are collapsed so an id can't be probed):

- `league_standings(p_league_id uuid)` → one row per account-holder:
  `user_id, username, display_name, avatar_url, played, points,
  dropped_points, firsts, rank`. Computed live: lateral-join
  `match_standings` (or `chork_standings`) over the League's finished
  weeks, pay the ladder, drop, rank. Nothing stored.
- `get_league(p_league_id uuid)` → the League row plus its weeks
  (`set_id, name, ended_at, started_at, status, player_count,
  winner_user_id`), newest first, and `is_host`.
- `get_my_leagues()` → the caller's Leagues, hosted or played, with
  `week_count, last_week_at, is_host, my_rank`.

The ladder lives in one SQL function, `league_placement_points(rank
smallint)`, and one TS constant, `LEAGUE_LADDER` (for the legend under
the table). A test parses migration 133 and pins the two equal — the
`compute_points` convention.

`endMatchAction` needs no change: a stamped Match joins the table the
moment its status flips, because the table is computed on read.

## App

**`src/lib/data/league-queries.ts`** — `getLeague`, `getLeagueStandings`,
`getMyLeagues`, thin over the RPCs, service-role, page-level auth
first. **`src/lib/data/league.ts`** — pure: `LEAGUE_LADDER`,
`dropsFor(weeks)`, `describeDropRule(weeks)` for copy.
**`src/lib/data/league-types.ts`** — client-safe row types.

**`src/app/match/league-actions.ts`** — five writes, each
`gateSignedInMutation(id, "league")` (or `null` for create's payload)
→ RPC → `ActionResult`. Covered by the hygiene test the moment the
file exists.

### Surfaces

1. **Summary page** (`/match/summary/[id]`, host only): "Make this a
   fixture" when the Match is in no League → a sheet asking for a
   name (pre-filled from the Match name), creates and navigates. When
   the host has Leagues: "Add to league" → picker. In a League already:
   a "Week 3 of *Tuesday*" line linking to it.
2. **League screen** `/match/league/[id]`: title + host; the table
   (rank · avatar · name · points · played, with the dropped total in
   `--mono-text-secondary` when a drop applies); the ladder legend and
   the drop rule in one line; the week list (each → its summary; a
   live one marked "in progress"); host controls in a `MatchMenuSheet`-
   style menu (rename, remove a week, end). Primary action for the
   host, while the League is live: **Start this week's Match** →
   `/match/new?league=<id>`.
3. **`/match/new?league=`**: `CreateMatchForm` pre-fills scale,
   grades, discipline and handicap from the League's latest week, and
   names it `<League> · week <n>`; `createMatchAction` takes an
   optional `leagueId` (caller must host the League) and stamps it.
4. **`/match` landing**: a "Your leagues" section above history —
   name, week count, your place — when `get_my_leagues` is non-empty.

The table uses the leaderboard row vocabulary (`UserAvatar
size="row"`, accent for the caller's own row). No podium on v1.

### Caching

Per-request reads, no `cachedQuery`: a League is read by a handful of
people and the roster changes with every week. Nothing to bust.

## Errors

- Not host → "Only the host can do that." (RPC raises; action maps).
- Match live / not yours / already in a League → the RPC's message,
  through `formatError`.
- League ended → "This league has ended."
- Not found / not on the roster → `notFound()` on the page, "League
  not found." from an action.

## Testing

- `league.ts` pure tests: the ladder, `dropsFor` at 3/4/7/8/12,
  `describeDropRule` copy.
- Ladder parity: migration 133's `league_placement_points` cases
  equal `LEAGUE_LADDER`.
- `league-actions.test.ts`: per action — malformed id, auth failure,
  rate limit, RPC error mapping, happy path payload.
- `createMatchAction` with `leagueId`: malformed, refused when not
  host (RPC error surfaces), stamped on success.
- Reducer/pure tests for anything the summary or league screens need
  to derive; no render-harness tests.
- SQL is exercised in the existing backup drill's schema replay
  (migration applies cleanly); standings correctness is pinned by a
  `psql`-runnable fixture in the migration's comment header, the way
  other migrations record their cases.
