# Jams — implementation plan

Companion doc for the Jams feature. Read `docs/architecture.md` +
`docs/schema.md` first; this file only describes the net delta.

Everything below is pre-build — nothing in this doc has been
implemented yet. The plan is organised so each section can be
reviewed and built independently in the order listed at the end.

---

## 1. Feature recap

Jams are player-created, ephemeral, cross-gym competitive climbing
sessions. A host starts a jam, any number of climbers join via code
or QR, players add routes as they go, everyone logs their own
attempts, and scores update live on a shared leaderboard. When the
jam ends, all the per-attempt working data collapses into a small
permanent summary and the live rows are deleted.

Key non-negotiables from the spec:

- Jams are **fully open** — no gym / crew membership required on
  either side. Hosts and players can be total strangers.
- The app currently treats a gym as mandatory at signup. Jams
  force that to be **optional**. Existing gym users stay gym users;
  new climbers can go gymless and still be first-class citizens.
- Live data must collapse into a **summary + per-player roll-up**
  on end, and the live rows must be deleted. Target per-completed-
  jam footprint: ~1 KB regardless of size.
- Anyone in a jam can end it (with confirm), anyone can add a route
  at any time, anyone can edit any route's metadata (groups
  self-police).
- Realtime sync for routes, logs, and the leaderboard while the jam
  is live. Offline writes queue and flush on reconnect.
- Jam activity counts toward existing gym achievements (flash,
  send, points totals). New jam-specific achievements added.
- Max 20 players (hard cap). Warn at 12.

---

## 2. Making gym optional (prerequisite)

This lands **before** any jam code. Everything else depends on the
app gracefully handling `profile.active_gym_id === null`.

### 2.1 Schema + DB

- `profiles.active_gym_id` is already nullable. No schema change
  needed for the profile itself.
- `profiles.onboarded` is the single source of truth for "finished
  signup" — decouple it from "has a gym".
- Audit every RPC that takes `p_gym_id`. None need to become
  nullable today; they stay gym-scoped. What changes is the set of
  callers that route around them when no gym is set.

### 2.2 Auth helpers (`src/lib/auth.ts`)

Current state:

- `requireSignedIn()` — checks user, no gym required.
- `requireAuth()` — checks user **and** `active_gym_id`.
- `requireGymAdmin()` — checks user + admin on a specific gym.

No new helper. Existing callers of `requireAuth()` fall into three
buckets:

| Caller bucket | Behaviour for gymless user |
|---|---|
| Gym-scoped page (`/`, `/leaderboard`, `/admin/*`, wall server actions) | Middleware / page redirects to `/jam` for gymless users (see 2.6). `requireAuth()` stays gated on gym. |
| Gym-only mutation (log a route, comment, grade vote) | Unreachable for gymless users — no route tiles rendered. No change needed. |
| Profile / crew / notifications / jam actions | Migrate from `requireAuth()` to `requireSignedIn()` and resolve `gymId` inline from `profile.active_gym_id` (may be null). |

Concrete audit needed of every `requireAuth()` call site during
build. List is small (11 files per exploration).

### 2.3 Middleware

`src/middleware.ts` currently only enforces onboarded, not gym-set.
No change. The per-route gym guards live in page-level code.

### 2.4 Nav bar

Gymless variant adds a new branch in `NavBar.tsx`:

- Currently: `AuthedNavSkeleton` + `AuthenticatedNav` always show
  Wall + Board + Crew + Profile (+ Admin conditionally).
- After: same auth-shell cookie, but `AuthenticatedNav` reads
  `profile.active_gym_id` and hides Wall + Board when null.

Final nav state:

- **Gym user**: Wall · Board · Crew · Jam · Profile (+ Admin if
  admin).
- **Gymless user**: Crew · Jam · Profile.

The skeleton (rendered before `AuthProvider` finishes bootstrap)
must also decide which variant to paint. Options:

a) Extend the `chork-auth-shell` cookie to a 3-state:
   `unauthed | authed-no-gym | authed-with-gym`. Middleware stamps
   the richer value; server component picks the matching skeleton.
b) Keep the cookie binary, always paint a "minimum nav" skeleton
   containing only the tabs that exist in **both** variants
   (Crew · Jam · Profile) during loading. Wall + Board + Admin
   pop in once the profile resolves.

**Recommendation**: (a). Middleware already calls
`profiles.onboarded` via the onboarded cookie; an extra lookup for
`active_gym_id is not null` is a single boolean in the same round
trip. Zero flash for the common case.

Cookie becomes `chork-auth-shell` with values `u`, `ang`, `awg`
(short so it doesn't bloat every response).

### 2.5 Five-tab fit on mobile

The Explore pass found tab padding is `padding: var(--space-1) var(--space-5)`
(4px × 20px) with `justify-content: space-evenly`. At 360px viewport
the existing 4 + brand compresses fine; 5 tabs at the same padding
is about `5 × (24px icon + 20px label + 2×20px padding) = 420px`
of natural width in a ~360px container. Flex will compress it, but
labels may clip.

Mitigation (one of):
- Drop horizontal tab padding from `--space-5` (20px) to `--space-3`
  (12px) at mobile via a media query — keeps the tap target via
  `min-height`, shrinks horizontal footprint by 40px total.
- Drop the gap between icon and label from `--space-1` (4px) to 0
  at mobile.
- Swap labels at ≤ 360px: not ideal, breaks consistency.

**Recommendation**: tighten horizontal padding at mobile only. No
label changes.

### 2.6 Pages that redirect or degrade for gymless users

| Route | Behaviour |
|---|---|
| `/` | If gymless, render a "Welcome to Chork" hero with "Start a jam" and "Add a gym" CTAs instead of the send grid. Landing page still wins when unauthed. |
| `/leaderboard` | Gymless users redirect to `/jam` with a toast ("Leaderboards live in gyms — try a jam!"). Or server-render a fallback explaining the same. |
| `/admin/*` | Unchanged. Gymless users can't be admins so the existing gym-admin gate already blocks them. |
| `/profile` + `/u/[username]` | Render but hide gym-scoped sections. See 2.8. |
| `/crew/*` | Crew is not gym-scoped — already works without a gym, needs spot verification. |

### 2.7 Onboarding flow (`src/app/onboarding/`)

Current steps: username + display name → gym picker (required) →
review. All in `form` step + `confirm` step on a single page.

New flow:

1. Username + display name (unchanged).
2. **New step** — "Does your gym have Chork?"
   - `Yes → pick your gym` branch reveals the existing gym picker.
   - `No → skip` branch sets `active_gym_id = null` and continues.
3. Review step shows the chosen gym OR "No gym for now" + a note
   that they can add one later in settings.
4. `completeOnboarding` action:
   - Conditionally creates the `gym_memberships` row and sets
     `active_gym_id` only if a gym was chosen.
   - Sets `onboarded = true` in all cases.

Existing test `src/app/onboarding/actions.test.ts` is extended with
the gymless path.

### 2.8 Profile page changes (`src/app/u/[username]/page.tsx`)

Today the page early-returns a "No gym selected" panel if `gymId`
is null. That branch becomes the new **gymless layout**:

- `ProfileHeader` — unchanged.
- `ProfileStats` — new variant: skip current set widget, skip
  previous sets rings. Show cross-source all-time stats from the
  new user-global RPC (see 4.3). Adds a Jams played / Jams won
  stat card.
- `ProfileAchievementsSection` — unchanged; evaluator now includes
  jam activity (see §6).
- `PreviousSetsSection` — hidden.
- **New** `ProfileJamsSection` — paginated list of jam summaries the
  user has participated in. Visible for any user (gym or gymless)
  with at least one jam on record. Tap opens a detail view.

Other-user view: same layout, no settings gear / bell, jams list
visible.

### 2.9 Settings gym switcher

`SettingsSheet` already has "Change gym" → `GymSwitcherSheet`.
Labels change:

- `active_gym_id` set → "Change gym" (unchanged).
- `active_gym_id` null → "Add a gym".

`GymSwitcherSheet` works today with a nullable `activeGymId`. No
refactor needed, just copy.

### 2.10 Stats unification

The existing `get_profile_summary(p_user_id, p_gym_id)` stays
gym-scoped — it powers the current-set widget + previous sets
grid, which are gym concepts. It gets **called only when
`active_gym_id` is not null**.

For all-time stats that union gym + jam activity, add a new RPC:

```sql
get_user_all_time_stats(p_user_id uuid)
  returns table (
    total_sends integer,
    total_flashes integer,
    total_zones integer,
    total_points integer,
    total_attempts integer,
    unique_routes_attempted integer,
    jams_played integer,
    jams_won integer
  )
```

Implementation unions `route_logs` (gym) + `jam_logs` (jams) and
sums via `computePoints`-equivalent SQL. `jams_played` / `jams_won`
come from `jam_summary_players`.

Gated by `p_user_id = (select auth.uid())` for own profile OR
unrestricted for public profile stats — matches the current
`get_profile_summary` gate.

**Open question**: rename the Profile "All-time on [gym name]"
copy to just "All time" when it's unioned? Only relevant for the
gym-user view — the current copy implies gym-scoped stats. For the
first cut I'd keep the gym-scoped version of the widget the
gym-user sees (it answers "how am I doing at this gym?"), and
introduce the unified stat card only for the gymless view +
achievements.

---

## 3. Schema + migrations

Six new tables. All RLS-enabled at creation. One new `pg_cron` job
(abandoned jam cleanup).

### 3.1 `jams`

```sql
create table jams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  name text,
  location text check (char_length(location) <= 120),
  host_id uuid not null references profiles(id) on delete cascade,
  grading_scale text not null check (grading_scale in ('v', 'font', 'custom')),
  min_grade smallint,       -- null for custom
  max_grade smallint,       -- null for custom (derived from jam_grades)
  status text not null default 'live' check (status in ('live', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index on jams (host_id);
create index on jams (status) where status = 'live';
create index on jams (last_activity_at) where status = 'live';
```

Code alphabet excludes `I`, `O`, `0`, `1` — keeps the 6-char code
unambiguous to read/type.

### 3.2 `jam_players`

```sql
create table jam_players (
  jam_id uuid not null references jams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (jam_id, user_id)
);

create index on jam_players (user_id);
```

No hard delete of own row — players "leave" by setting `left_at`.
Summary computation excludes players with `left_at is not null`.

### 3.3 `jam_grades`

Per-jam custom grade snapshot. For `v` / `font` jams there are no
rows (labels derive from the scale).

```sql
create table jam_grades (
  jam_id uuid not null references jams(id) on delete cascade,
  ordinal smallint not null check (ordinal >= 0),
  label text not null check (char_length(label) between 1 and 40),
  primary key (jam_id, ordinal)
);
```

### 3.4 `jam_routes`

```sql
create table jam_routes (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references jams(id) on delete cascade,
  number integer not null check (number > 0),
  description text check (char_length(description) <= 240),
  grade smallint,              -- 0..30 for v/font; ordinal for custom; nullable for ungraded
  has_zone boolean not null default false,
  added_by uuid not null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (jam_id, number)
);

create index on jam_routes (jam_id, number);
```

### 3.5 `jam_logs`

```sql
create table jam_logs (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references jams(id) on delete cascade,
  jam_route_id uuid not null references jam_routes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  attempts integer not null default 0 check (attempts between 0 and 999),
  completed boolean not null default false,
  completed_at timestamptz,
  zone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, jam_route_id)
);

create index on jam_logs (jam_id);
create index on jam_logs (user_id);
create index on jam_logs (jam_route_id, completed);
```

Idempotency for the offline queue: unique `(user_id, jam_route_id)`
matches the `(user_id, route_id)` pattern on `route_logs`.

### 3.6 `jam_summaries`

Permanent historical record. `jam_id` retained as a stable identity
even though the underlying jam row is deleted on end.

```sql
create table jam_summaries (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null unique,
  name text,
  location text,
  host_id uuid references profiles(id) on delete set null,
  grading_scale text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null,
  player_count smallint not null check (player_count between 1 and 20),
  winner_user_id uuid references profiles(id) on delete set null,
  payload jsonb not null,      -- top routes, grade snapshot, per-player detail
  created_at timestamptz not null default now()
);

create index on jam_summaries (created_at desc);
create index on jam_summaries (host_id);
create index on jam_summaries (winner_user_id) where winner_user_id is not null;
```

`payload` jsonb shape (documented but not enforced by a schema):

```json
{
  "grading_scale": "v",
  "grades": [                // for custom only, otherwise null
    { "ordinal": 0, "label": "Blue Circuit" }, ...
  ],
  "top_routes": [             // up to 5, by attempts across players
    { "number": 3, "grade": 4, "has_zone": true, "total_attempts": 14, "sends": 3 }
  ]
}
```

### 3.7 `jam_summary_players`

Normalised for query-ability — "all jams user has played" is a
plain join, no jsonb unpack.

```sql
create table jam_summary_players (
  jam_summary_id uuid not null references jam_summaries(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  rank smallint not null,
  sends smallint not null,
  flashes smallint not null,
  zones smallint not null,
  points smallint not null,
  attempts smallint not null,
  is_winner boolean not null default false,
  display_name text not null,      -- snapshot — user may delete profile
  username text not null,          -- snapshot
  primary key (jam_summary_id, user_id)
);

create index on jam_summary_players (user_id, jam_summary_id);
```

`display_name` + `username` are denormalised snapshots so the
history stays readable if a user deletes their account or renames
their handle.

### 3.8 `user_custom_scales` + `user_custom_scale_grades`

For the "Save this scale" reuse feature.

```sql
create table user_custom_scales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create index on user_custom_scales (user_id);

create table user_custom_scale_grades (
  scale_id uuid not null references user_custom_scales(id) on delete cascade,
  ordinal smallint not null check (ordinal >= 0),
  label text not null check (char_length(label) between 1 and 40),
  primary key (scale_id, ordinal)
);
```

### 3.9 Role helpers

```sql
is_jam_player(p_jam_id uuid) returns boolean
  -- EXISTS in jam_players where user_id = auth.uid() and left_at is null

is_jam_summary_participant(p_jam_summary_id uuid) returns boolean
  -- EXISTS in jam_summary_players where user_id = auth.uid()
```

Both `SECURITY DEFINER`, `search_path = ''`, granted to
authenticated.

### 3.10 RLS policies

`jams`:
- SELECT: authenticated — payload is safe (just jam metadata).
- INSERT: user_id = (select auth.uid()) (host_id match).
- UPDATE: `is_jam_player(id)` and `status = 'live'` — live-only
  updates (for `last_activity_at` bumps; status flip handled by
  `end_jam` RPC under service role).
- DELETE: service role only (jams get cleaned by the `end_jam` RPC).

`jam_players`:
- SELECT: `is_jam_player(jam_id)`.
- INSERT: `user_id = (select auth.uid())` AND jam is live AND
  player count < 20 AND jam_players has no existing row (join or
  rejoin).
- UPDATE: `user_id = (select auth.uid())` — only for setting
  `left_at` on self.
- DELETE: none (we soft-delete via `left_at`).

`jam_grades`:
- SELECT: `is_jam_player(jam_id)`.
- INSERT: `is_jam_player(jam_id)` AND host_id = auth.uid() — only
  the host sets grades on creation (transactional part of `create_jam`).
- UPDATE / DELETE: none in v1.

`jam_routes`:
- SELECT: `is_jam_player(jam_id)`.
- INSERT: `is_jam_player(jam_id)` AND jam is live.
- UPDATE: `is_jam_player(jam_id)` AND jam is live — group
  self-polices.
- DELETE: none (routes can't be removed mid-jam).

`jam_logs`:
- SELECT: `is_jam_player(jam_id)` — players see every other
  player's log state for leaderboard + skeleton tiles.
- INSERT / UPDATE / DELETE: `user_id = (select auth.uid())` AND
  `is_jam_player(jam_id)` AND jam is live.

`jam_summaries`:
- SELECT: authenticated (public within app so other users can view
  a climber's jam history on their profile).
- No write policies — inserts via `end_jam` service-role RPC only.

`jam_summary_players`:
- SELECT: authenticated.
- No write policies.

`user_custom_scales` + `user_custom_scale_grades`:
- SELECT / INSERT / UPDATE / DELETE: `user_id = (select auth.uid())`
  or scale owned via FK chain. Private to owner.

---

## 4. RPC surface

All `SECURITY DEFINER`, `search_path = ''`, explicit
`grant execute … to authenticated` (or `service_role` where
noted). Error on violation of gate returns empty set, not raise.

### 4.1 `generate_jam_code() returns text`

Service-role-only helper. Generates a random 6-char code (same
alphabet as the CHECK), retries up to 10× on collision, raises on
exhaustion. Called inside `create_jam`. Not exposed to
authenticated callers.

### 4.2 `create_jam(...)`

```sql
create_jam(
  p_name text,
  p_location text,
  p_grading_scale text,
  p_min_grade smallint,
  p_max_grade smallint,
  p_custom_grades text[],     -- ordered label list for custom
  p_save_scale_name text      -- non-null → persist to user_custom_scales
) returns jams
```

Atomic: inserts the jam, `jam_grades` rows if custom, the host's
`jam_players` row, optionally `user_custom_scales` + grades if
`p_save_scale_name` is supplied. Gated by `auth.uid()` — caller
becomes host.

### 4.3 `join_jam_by_code(p_code text)`

```sql
returns table(
  jam_id uuid,
  name text,
  location text,
  host_username text,
  host_display_name text,
  player_count smallint,
  grading_scale text,
  status text,
  at_cap boolean
)
```

Returns the jam's public-ish identity without adding the caller as
a player (for the Confirm-join screen). Caller validation happens
separately on the actual join mutation.

### 4.4 `add_jam_player(p_jam_id uuid)`

Inserts the caller into `jam_players`. Gated:

- jam exists and `status = 'live'`
- caller has no existing row (no rejoin after leave in v1 — ties
  are hard if people come and go)
- `player_count < 20`

Returns the new row or raises a friendly error code that the
server action maps to a user-facing message.

### 4.5 `add_jam_route(...)`

```sql
add_jam_route(
  p_jam_id uuid,
  p_description text,
  p_grade smallint,
  p_has_zone boolean
) returns jam_routes
```

Computes next `number` inside the transaction. Gated by
`is_jam_player`, jam is live. Bumps `last_activity_at` on jams.

### 4.6 `update_jam_route(...)`

```sql
update_jam_route(
  p_route_id uuid,
  p_description text,
  p_grade smallint,
  p_has_zone boolean
) returns jam_routes
```

Gated — any player on the jam the route belongs to can edit. Bumps
`last_activity_at`.

### 4.7 `upsert_jam_log(...)`

```sql
upsert_jam_log(
  p_jam_route_id uuid,
  p_attempts integer,
  p_completed boolean,
  p_zone boolean
) returns jam_logs
```

Idempotent upsert on `(user_id, jam_route_id)`. `completed_at` set
server-side on transition to completed. Bumps `last_activity_at`.

### 4.8 `get_jam_leaderboard(p_jam_id uuid)`

```sql
returns table(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  sends smallint,
  flashes smallint,
  zones smallint,
  points smallint,
  attempts smallint,
  rank smallint
)
```

Applies `computePoints` logic in SQL (`case when attempts = 1 then 4 …`).
Tiebreak: points desc, flashes desc, sends desc, earliest final
`completed_at` asc. Gated by `is_jam_player`. Reads are cheap
(<20 players × <50 routes).

### 4.9 `get_jam_state(p_jam_id uuid)`

Bundle RPC: returns jam metadata, grades, routes, players, the
caller's own logs, and the leaderboard — one round trip to
hydrate the jam screen on first paint. Pattern mirrors
`get_profile_summary`.

### 4.10 `end_jam(p_jam_id uuid)`

**The big one.** Service-role-visible, called from an `endJamAction`
server action that uses the service-role client because the RPC
needs to bypass the `is_jam_player` gate to DELETE.

Transactional:

1. Fetch all `jam_players` (non-left), `jam_logs`, `jam_routes`,
   `jam_grades`.
2. Compute per-player aggregates + rank (same tiebreak order as
   the leaderboard RPC).
3. Insert `jam_summaries` row (with winner_user_id set) + payload
   jsonb (top 5 routes by total attempts, grade snapshot for
   custom, duration).
4. Insert one `jam_summary_players` row per eligible player.
5. Set `jams.status = 'ended'`, `ended_at = now()`.
6. **Delete** `jam_logs`, `jam_routes`, `jam_grades`, `jam_players`
   for the jam.
7. Delete the `jams` row itself.

All inside one transaction — either every row collapses cleanly
into the summary or nothing happens.

Achievement re-evaluation is kicked off **from the server action**
after `end_jam` returns, for each participant, via
`after()` — same pattern as `completeRoute`.

### 4.11 `end_stale_jams()`

Service-role-only. Scans `jams` with `status = 'live'` AND
`last_activity_at < now() - interval '24 hours'` and calls
`end_jam` for each. Called by `pg_cron` every hour:

```sql
select cron.schedule('end_stale_jams', '0 * * * *',
                     $$ select end_stale_jams(); $$);
```

### 4.12 `get_user_all_time_stats(p_user_id uuid)`

User-global stats for profile rendering. Unions `route_logs` +
`jam_logs`. Returns the shape in §2.10. Gated by
`p_user_id = auth.uid()` OR an unrestricted path (public profile
viewing) — match the existing `get_profile_summary` gate.

### 4.13 `get_user_jams(p_user_id uuid, p_limit int, p_before timestamptz)`

Cursor-paginated list for the profile Jams section and the Jam
tab's Recent Jams list (with different limits). Returns:

```
id, jam_id, name, location, ended_at, player_count,
user_rank, user_points, user_sends, user_flashes,
winner_user_id, winner_username, winner_display_name,
user_is_winner
```

Joins `jam_summaries` ⋈ `jam_summary_players` (self) + winner.

### 4.14 `get_user_saved_scales(p_user_id uuid)`

Returns the caller's saved custom scales with their grade labels
as a jsonb array. Only callable for self.

### 4.15 Context helper for achievements

```sql
get_jam_achievement_context(p_user_id uuid)
  returns table(
    jams_played integer,
    jams_won integer,
    jams_hosted integer,
    max_players_in_won_jam integer,
    unique_coplayers integer,
    max_iron_crew_pair_count integer
  )
```

`max_iron_crew_pair_count`: for each mate-pair (you + two others),
count jams where all three appeared. Return the max. ≥10 earns
Iron Crew (strictest honest interpretation of "10 jams with the
same 3 people").

---

## 5. Frontend architecture

### 5.1 Route layout

New routes:

- `/jam` — landing screen for the Jam tab (see §5.4).
- `/jam/new` — create flow (sheet → dedicated page for full-screen
  feel on mobile). Can alternatively live as a sheet inside `/jam`.
- `/jam/join` — join by code / QR (same).
- `/jam/[id]` — live jam screen when status is 'live'.
- `/jam/summary/[id]` — summary view for a completed jam
  (uses `jam_summaries.id`, not the original `jam_id`).

Redirects:
- Middleware / page: `/jam/[id]` where id maps to an ended jam
  auto-redirects to `/jam/summary/{summary.id}`.

### 5.2 New components

Under `src/components/Jam/`:

- `JamTabLanding.tsx` — /jam page layout (banner + Start/Join +
  recent).
- `ActiveJamBanner.tsx` — top banner visible when user is in a
  live jam. Accepts `jam_id`, renders jam name, location, player
  count, resume button.
- `StartJamButton.tsx` — primary CTA.
- `JoinJamButton.tsx` — primary CTA. Opens `JoinJamSheet`.
- `JoinJamSheet.tsx` — sheet with code input + QR scanner button.
  Uses BarcodeDetector API (falls back to `ZXing` via CDN only if
  unsupported — gated behind capability check).
- `JoinJamConfirm.tsx` — the "confirm join" screen after scanning
  or entering a code.
- `CreateJamFlow.tsx` — full form: name, location, scale tabs
  (v / font / custom), min-max pickers for v/font, grade list
  editor for custom, saved scales pill row, "save this scale"
  checkbox.
- `JamHeader.tsx` — header bar on the live jam screen.
- `JamGrid.tsx` — sends grid variant. Reuses `PunchTile` from
  `src/components/PunchTile/`. Adds a trailing `+` tile.
- `AddRouteSheet.tsx` — sheet for adding a route (description,
  grade picker, zone toggle).
- `EditRouteSheet.tsx` — same sheet reused for edits by any
  player.
- `JamLogSheet.tsx` — the attempt-log drawer for a jam tile.
  Mirrors `RouteLogSheet.tsx` structure but without beta spray /
  comments, and with the jam's grade scale rather than the set's.
- `JamLeaderboard.tsx` — live leaderboard panel. Segmented with
  grid (live view toggle).
- `JamPlayerList.tsx` — tapping player count reveals the full
  list, with ability to tap through to profiles.
- `JamMenuSheet.tsx` — share code / QR / end jam.
- `ShareJamSheet.tsx` — join code big, QR code, copy-link button.
- `EndJamConfirm.tsx` — confirmation before ending.
- `JamResultScreen.tsx` — winner announcement + final board + share
  result button. Reached via `/jam/summary/[id]?fresh=1` after
  `end_jam` returns, or via navigating to a completed summary.
- `JamHistoryList.tsx` — paginated list of the user's jams.
  Renders in both profile and jam-tab-recent contexts (with a
  `limit` prop).
- `JamHistoryRow.tsx` — single row.
- `ProfileJamsSection.tsx` — profile wrapper for `JamHistoryList`.

Shared / extended:
- `NavBar.tsx` — add Jam tab (authed shell + full authed nav),
  hide Wall + Board when gymless.
- `NavBarShell.tsx` — consume 3-state shell cookie; pick
  variant.
- `ProfileStats.tsx` — branch on `has_gym`; render jam stat card.
- `SettingsSheet.tsx` — copy change on gym switcher row.

### 5.3 New hooks

Under `src/hooks/`:

- `useActiveJam()` — reads the user's current live jam (if any)
  for the banner. Thin fetch on mount + subscription to jam_players
  changes.
- `useJamRealtime(jamId)` — subscribes to `jam_routes`, `jam_logs`,
  `jam_players` changes scoped to the jam. Returns snapshot state
  for the jam screen. Cleanup on unmount via the returned
  disposer.
- `useJamLeaderboard(jamId, jamLogs, jamRoutes, players)` —
  pure client-side derivation from the state hook's output, for
  the live leaderboard between server `get_jam_leaderboard`
  refreshes. Matches the RPC's tiebreak order via `computePoints`
  (reuses `src/lib/data/logs.ts`).
- `useQrScanner(onCode)` — wraps BarcodeDetector API with
  permissions prompt + fallback.
- `useJamHistory(userId, limit)` — cursor-paginated fetch of the
  user's jam summaries.

### 5.4 Jam tab layout (`/jam`)

Three vertical sections in order:

1. `<ActiveJamBanner />` — conditional, visible whenever user has
   a live `jam_players` row (no `left_at`). Tapping "Resume" routes
   to `/jam/[id]`.
2. **Start / Join** — two big buttons stacked on mobile, inline on
   tablet. Primary button styling from existing `Button` component.
3. **Recent jams** — `<JamHistoryList limit={5} />`. Empty-state
   copy when user has no jams.

Empty state across the whole page: "No active jams. Start one to
get going."

### 5.5 Create jam flow

Route `/jam/new` or full-screen sheet from `/jam`. Steps on one
screen (not a wizard):

1. Optional `name` input.
2. Optional `location` input.
3. Grading scale segmented control: V-scale · Font · Custom.
4. For V-scale: two grade pickers (min and max) over `gradeLabels("v", 17)`.
5. For Font: same over `gradeLabels("font", 21)`.
6. For Custom:
   - Row of saved-scale pills at top (from `get_user_saved_scales`).
     Tapping one pre-populates the grade list.
   - Editable grade list (add / reorder / remove). Ordered easiest
     to hardest.
   - Checkbox: "Save this scale" with a name input (disabled when
     pre-populated from a saved scale).
7. Submit button `Create jam`.

On submit:
- Call `createJamAction(...)` server action that invokes
  `create_jam` RPC.
- On success, navigate to `/jam/[new-id]`.

### 5.6 Join jam flow

Triggered from the `JoinJamButton` on /jam, or directly via
`/jam/join?code=XXXX` (future share-link support).

`JoinJamSheet`:
- Code input (6 chars, auto-uppercase, validated against alphabet).
- `Scan QR` button — opens camera via `useQrScanner`, auto-fills
  the code on detection.
- Proceed button.

On proceed:
- Call `joinJamLookupAction(code)` → `join_jam_by_code` RPC.
- Show `JoinJamConfirm` with name, location, host, player count.
- Tapping Join calls `joinJamAction(jamId)` → `add_jam_player`
  RPC.
- Navigate to `/jam/[id]`.

Edge cases:
- Jam at cap → friendly error surfaced from RPC.
- Jam already ended → redirect to summary instead.
- Jam code not found → inline error.

### 5.7 Live jam screen (`/jam/[id]`)

Layout (top to bottom on mobile, two-column on tablet+):

- Header: `<JamHeader />` — jam name (or fallback), location, player
  count chip, menu icon.
- `<JamLeaderboard />` — either inline strip (top 3 + "more" chevron)
  or as a tab-switch with the grid. Mobile decides; simplest v1 is
  a collapsible panel above the grid.
- `<JamGrid />` — numbered tiles with trailing `+`. Tap a tile →
  `<JamLogSheet />`. Tap `+` → `<AddRouteSheet />`.

Realtime: `useJamRealtime(jamId)` subscribes to:
- `jam_routes` on `jam_id = :jamId`
- `jam_logs` on `jam_id = :jamId`
- `jam_players` on `jam_id = :jamId`

On change, patches local state. Cleanup on unmount. Matches
existing Supabase browser client patterns (no realtime in the app
today; this introduces the pattern).

Dropouts:
- The existing `OfflineBanner` surfaces connection loss globally.
- Extend it (or add a thin `JamConnectionBanner`) while on a jam
  route to also flag realtime-channel state vs pure `navigator.onLine`.
- Logs made offline queue via the existing offline pipeline (see
  §7).

### 5.8 Menu / share / end

`<JamMenuSheet />` actions:
- Share code — opens `<ShareJamSheet />`.
- End jam — opens `<EndJamConfirm />`.

`<EndJamConfirm />`:
- Confirmation copy: "End jam for everyone? Final scores will be
  calculated and the jam will be closed."
- On confirm: `endJamAction(jamId)` → service-role wrapper around
  `end_jam` RPC → kicks off achievement re-eval via `after()` for
  each participant → returns the new `jam_summaries.id`.
- Navigate to `/jam/summary/[id]?fresh=1` which renders
  `<JamResultScreen />`.

`<JamResultScreen />`:
- Winner takes the top visual slot with name + avatar.
- Final board (reuses `<JamLeaderboard>` in read-only mode).
- Each player's top line stats.
- `Share result` button — generates an OG image via existing
  pattern (see `src/app/api/og/`) and opens the share sheet with a
  link or image blob.
- `Done` button → back to `/jam`.

### 5.9 Jam history (profile + recent)

`<JamHistoryList />`:
- Paginated via `get_user_jams` RPC.
- Default page size 20 for the profile view; 5 for the `/jam`
  recent strip via `limit` prop.
- Each row shows jam name, location, date, player count, user's
  rank badge, winner's handle if not the viewer.
- Tapping a row → `/jam/summary/[id]`.

`<ProfileJamsSection />`:
- Wraps `<JamHistoryList />` with a section header "Jams".
- Visible for any user (gym or gymless) whose `get_user_jams`
  returns at least one row.

---

## 6. Achievements

### 6.1 New badges (add to `src/lib/badges.ts`)

| ID | Trigger |
|---|---|
| `jam-first-jam` | First jam played |
| `jam-first-win` | First jam win |
| `jam-reigning-champ` | 5 jams won |
| `jam-legend` | 25 jams won |
| `jam-big-fish` | Won a jam with ≥ 6 players |
| `jam-host-with-the-most` | Hosted 10 jams |
| `jam-social-climber` | Played jams with ≥ 20 different users |
| `jam-iron-crew` | 10 jams with the same 3+ people (approx via pair max — see §4.15) |

Copy + medal names TBD at build. Use the existing copywriting tone
(climbing-adjacent humour).

### 6.2 BadgeContext changes

`BadgeContext` in `src/lib/achievements/context.ts` gains:

```ts
interface BadgeContext {
  // existing...
  totalFlashes: number;
  totalSends: number;
  totalPoints: number;
  completedRoutesBySet: Map<string, Set<number>>;  // gym-only
  totalRoutesBySet: Map<string, number>;
  flashedRoutesBySet: Map<string, Set<number>>;
  zoneAvailableBySet: Map<string, Set<number>>;
  zoneClaimedBySet: Map<string, Set<number>>;

  // NEW — jam-scoped
  jamsPlayed: number;
  jamsWon: number;
  jamsHosted: number;
  maxPlayersInWonJam: number;
  uniqueJamCoplayers: number;
  ironCrewMaxPairCount: number;
}
```

`buildBadgeContext(supabase, userId, gymId?)` changes:
- When gymId present: existing gym data fetch unchanged.
- Always: fetch jam context via `get_jam_achievement_context(userId)`.
- Existing totals (`totalFlashes`, `totalSends`, `totalPoints`):
  union jam logs from `jam_summary_players` (aggregated points,
  sends, flashes). Gym-scoped per-set maps stay gym-only — jam
  "sets" don't exist as identifiable numbered sets in the same
  way (every jam is its own ad-hoc set). Rhyme-pair / Saviour /
  Green / In the Zone badges stay gym-only by design.

### 6.3 Evaluation call sites

- `completeRoute` server action — unchanged. Uses current gym
  context.
- `endJamAction` server action — calls `evaluateAndPersistAchievements`
  via `after()` for each participant with `gymId = null` (or each
  participant's own active gym). Simplest: pass `gymId = null` and
  let the evaluator compute only the jam-driven badge deltas —
  gym-scoped badges (rhyme pairs, Saviour, In the Zone) are
  unaffected by a jam end regardless.

The "flash is a flash" unification means:
- The 9 Thunder progression badges + Century will fire when the
  cumulative total (gym + jam) crosses each threshold — even for
  gymless users who've only ever jammed.

### 6.4 Tests

`src/lib/badges.test.ts` — extend `makeCtx` with zero defaults for
all new jam fields, add tests for each new badge.

`src/lib/achievements/evaluate.test.ts` — add fixtures exercising
a gymless user whose totals come entirely from `jam_summary_players`.

---

## 7. Offline sync

### 7.1 New offline action

`src/lib/offline/types.ts` — add `"upsertJamLog"` to
`OFFLINE_ACTIONS`.

`src/lib/offline/action-map.ts` — map `"upsertJamLog"` → the
`upsertJamLogAction` server action.

`src/lib/offline/actions.ts` — wrap via `withOfflineQueue`:

```ts
export const upsertJamLogWithOffline = withOfflineQueue(
  "upsertJamLog",
  upsertJamLogAction,
  (jamRouteId) => jamRouteId,   // dedup key
);
```

### 7.2 Compaction

Jam logs follow the same `LAST_WRITE_WINS_ACTIONS` pattern as
`route_logs`. A later `upsertJamLog` for the same `(user, jam_route)`
supersedes the older entry. Same transformation as the existing
pipeline.

### 7.3 Idempotency

`upsertJamLogAction` uses `.upsert({...}, { onConflict: "user_id,jam_route_id" })`.
Matches the existing `upsertRouteLog` pattern (see
`docs/db-audit.md` § F).

### 7.4 Realtime-offline interplay

When a user's offline logs flush post-reconnect, realtime channels
will emit the inserts to the other players automatically — no
extra client-side broadcast needed. The local optimistic state
should reconcile with the realtime echo on the same row by treating
the realtime event as canonical.

### 7.5 Zombie-jam prevention

The `end_stale_jams` cron job (§4.11) handles the "user closed
the app and never came back" case. Banner on /jam surfaces
current-live state so an active reconnection is one tap.

---

## 8. Data access helpers

New files under `src/lib/data/`:

- `jam-queries.ts`:
  - `getActiveJamForUser(supabase)` → `{ jamId, name, location, playerCount } | null`
  - `getJamState(supabase, jamId)` — calls `get_jam_state` RPC
  - `getJamLeaderboard(supabase, jamId)`
  - `getUserJams(supabase, userId, { limit, before })`
  - `getJamSummary(supabase, summaryId)` — one row + players
  - `getUserSavedScales(supabase, userId)`
  - `lookupJamByCode(supabase, code)`
  - `getUserAllTimeStats(supabase, userId)` — NEW unified stats
- `jam-mutations.ts`:
  - `createJam(...)` → calls `create_jam` RPC
  - `joinJam(jamId)` → `add_jam_player`
  - `leaveJam(jamId)` → sets `left_at`
  - `addJamRoute(...)` / `updateJamRoute(...)` / `upsertJamLog(...)`
  - `endJam(jamId)` — uses service-role client to call `end_jam`
    (mutations pattern)
- `jam-types.ts` — local TS types deriving from `database.types.ts`.

Server actions (`src/app/(app)/actions.ts` or new
`src/app/jam/actions.ts`):

- `createJamAction(formData)` — parse + validate + `requireSignedIn`
- `joinJamLookupAction(code)`
- `joinJamAction(jamId)`
- `leaveJamAction(jamId)`
- `addJamRouteAction(jamId, payload)`
- `updateJamRouteAction(routeId, payload)`
- `upsertJamLogAction(jamRouteId, payload)` — also wired via
  offline queue
- `endJamAction(jamId)` — service-role, kicks off achievement
  re-eval via `after()`

### 8.1 Tag taxonomy additions

Extend `Tag` union in `src/lib/cache/cached.ts`:

- `jam:{id}` — live jam metadata.
- `jam:{id}:routes` — route set changed.
- `jam:{id}:leaderboard` — invalidated on log insert (though
  leaderboard is read real-time, not cached — tag reserved for
  future wrap).
- `user:{id}:jams` — jam summaries for a user.

Nothing in the jam path is initially cached at Layer 2 — everything
is realtime or per-request. Tags reserved so future optimisations
don't require mutation-site edits.

---

## 9. Styling + visual language

All jam surfaces use the existing design tokens:

- Dark-mode-first, lime accent, Radix scale discipline per
  CLAUDE.md.
- Tile states use the same `--flash-*`, `--accent-*`, `--zone-*`
  (teal) palettes as the wall.
- Jam tab active colour uses the same sliding-pill + accent-text
  pattern.
- Oversized italic Outfit black numerics on the leaderboard and
  winner announcement (echoes profile / hero).
- Surface mixins (`surface.card`, `surface.chrome`,
  `surface.glass($opacity)`) — no hand-rolled card styles.
- Page layout via `layout.page` — jam screens are single-column
  on mobile, wider on tablet.

New icon: **FaRing** or **FaCalendar** per the Explore pass.
**Recommendation**: FaRing — unused elsewhere, reads as
"gathering" without overlapping Crew's FaUserGroup, and has the
same line-weight as the other fa6 glyphs. Final call at build.

---

## 10. Testing

Action tests for every new server action (follow the pattern in
`docs/testing.md`):

- `src/app/jam/actions.test.ts` — create, join lookup, join, add
  route, update route, upsert log, leave, end jam.

Unit tests:

- `src/lib/data/jams.test.ts` — any pure helpers (code generation
  validators, join-code normalisers, grade formatters per scale).
- `src/lib/achievements/evaluate.test.ts` — gymless user,
  jam-only user, jam + gym user, each new badge's threshold.

Type tests:

- `src/lib/data/types.test.ts` — new RPC return shapes.

Storybook:

- `JamGrid.stories.tsx` — empty, partial, full (at cap).
- `JamLeaderboard.stories.tsx` — 1 / 5 / 12 / 20 players, tie cases.
- `JamLogSheet.stories.tsx`, `AddRouteSheet.stories.tsx`.
- `JamResultScreen.stories.tsx` — solo winner, close finish.
- `JamHistoryList.stories.tsx` — empty / populated.
- `ActiveJamBanner.stories.tsx`.
- `ProfileJamsSection.stories.tsx`.

---

## 11. Open questions + design decisions to confirm

These are intentional forks where the spec left room. Flag your
preference during review before build begins:

1. **Shell cookie expansion**: 3-state `chork-auth-shell` (`u` /
   `ang` / `awg`) vs keep binary and live with a skeleton mismatch
   on gymless users. Recommendation: expand.
2. **Custom scale reuse**: delete a saved scale without warning
   even if it was used in historical jams? Scales are just
   templates — jam_grades snapshots the state at creation time —
   so deleting is safe. No warning needed.
3. **Iron Crew interpretation**: pair-max (§4.15) vs true triple-
   enumeration. Pair-max is cheaper and almost always equivalent
   for small friend groups.
4. **Rejoin after leave**: not supported in v1 (per §4.4). If a
   player leaves and wants back in, host ends the jam and starts
   a new one. Adding rejoin is a separate scope.
5. **Jam activity toward gym-scoped badges**: rhyme-pair /
   Saviour / Green / In the Zone stay **gym-only** because they
   depend on numbered gym routes. Confirmed above. Thunder
   progression + Century + First (A)send **cross-count** jam +
   gym.
6. **All-time stats on gym-user profile**: today shows "all-time
   on {gym}". After this change the Jams section makes gym + jam
   stats visible separately. Consider rename to "All time on
   {gym}" for the gym widget (already is) and drop a separate
   "Lifetime" card that shows unified totals. For v1 keep gym
   stats as-is and add the Jams section + jam-count cards only.
7. **Share result image**: v1 = styled screenshot via
   `/api/og/jam-result/[id]` (dynamic OG image). Out of scope for
   the initial PR; do a lightweight "copy text summary to
   clipboard" instead and treat rich image share as a fast-follow.
8. **Realtime for /jam banner**: the banner polls for "do I have
   an active jam?" on mount only. Missing a jam invite from another
   device means one more tap to refresh — acceptable v1. If users
   complain, add a lightweight channel subscription for their own
   `jam_players` rows.

---

## 12. Build sequence

Ordered so each step ships behind-the-scenes green without
shipping half a feature:

### Phase 1 — gym-optional plumbing (no user-visible jam)

1. Migration: index / audit-only (no schema change here).
2. `requireAuth()` callers audit — keep gated callers as-is; for
   callers that should be gym-agnostic, swap to `requireSignedIn`
   + null-safe gym lookup.
3. Onboarding form: "Does your gym have Chork?" step. Action:
   make gym optional.
4. Profile: gymless layout variant (hide current set + previous
   sets, keep header + achievements + all-time).
5. Nav: gymless variant (hide Wall + Board).
6. Middleware / shell cookie: 3-state.
7. Redirect rules for `/`, `/leaderboard` when gymless.
8. `get_user_all_time_stats` RPC + profile wiring.
9. Settings label: "Add a gym" when gymless.

Ships independently. Full regression pass. Test: a fresh user can
sign up without a gym, reach the app, see Crew + Profile (no Wall,
no Board, no Jam yet), and later add a gym from settings.

### Phase 2 — jam schema + base RPCs

1. Migration 041: `jams`, `jam_players`, `jam_grades`, `jam_routes`,
   `jam_logs`, role helpers, RLS, indexes.
2. Migration 042: `jam_summaries`, `jam_summary_players`, RLS.
3. Migration 043: `user_custom_scales` + grades, RLS.
4. Migration 044: RPCs — `generate_jam_code`, `create_jam`,
   `join_jam_by_code`, `add_jam_player`, `add_jam_route`,
   `update_jam_route`, `upsert_jam_log`, `get_jam_leaderboard`,
   `get_jam_state`, `get_user_jams`, `get_user_saved_scales`.
5. Migration 045: `end_jam` service-role RPC, `end_stale_jams`
   service-role RPC, `pg_cron` hourly schedule.
6. Migration 046: `get_jam_achievement_context` + RPC for
   unified all-time stats (`get_user_all_time_stats` — or folded
   into phase 1 if preferred).
7. Regenerate types.

Ships schema + backend without UI. Test: SQL-level verification
of create → join → add route → log → end → summary round trip.

### Phase 3 — jam tab + core UI

1. Nav Jam tab (icon, route, active-state).
2. `/jam` landing page (banner + start/join + recent empty state).
3. Create jam flow (`/jam/new` or sheet).
4. Join jam flow + join-by-code lookup.
5. Live jam screen without realtime — manual refresh works.
6. Jam log sheet (single-player functionality).
7. Add route + edit route sheets.
8. Leaderboard panel (server-fetched).

Ships a functional jam for one player at a time. Test: host can
create, add routes, log attempts, see their own leaderboard row.

### Phase 4 — multi-player + realtime

1. `useJamRealtime` hook — subscribe to routes, logs, players.
2. Live leaderboard updates on events.
3. Connection indicator on jam screen.
4. Share code / QR sheet.
5. QR scanner wired.

Test: two devices join the same jam, see each other's routes and
logs update in real time.

### Phase 5 — end jam + summary

1. End jam confirmation sheet.
2. `endJamAction` wiring with service-role client.
3. `/jam/summary/[id]` route + result screen.
4. Winner announcement + final board UI.
5. Share result v1 (text to clipboard).

Test: end-jam transition collapses live data, summary renders,
achievements fire.

### Phase 6 — profile integration + achievements

1. `ProfileJamsSection` + paginated list.
2. Tap-through to summary from profile.
3. `ProfileStats` jam cards (jams played / jams won) on gymless
   variant.
4. Badge catalogue additions.
5. `BadgeContext` extensions + jam-aware evaluator.
6. Achievement eval triggered from `endJamAction` via `after()`.

Test: ending a jam unlocks "First jam", subsequent wins stack
through Reigning Champ → Legend; gymless user earns Thunder
progression purely from jams.

### Phase 7 — offline + polish

1. `upsertJamLog` registered in offline queue.
2. Edge cases: cap-reached, already-ended, code-not-found friendly
   errors.
3. Abandoned-jam cron verification.
4. Empty states, zero-state copy pass.
5. Storybook coverage.

Test: airplane-mode → log attempts → reconnect → logs appear in
realtime for co-players.

---

## 13. What this does not touch

Confirmation for scope hygiene:

- No changes to `competitions` / `comp_*` tables.
- No changes to `user_set_stats` (jams use their own aggregates).
- No changes to `route_logs` or `routes` schema — jam and gym paths
  are fully separate at the storage layer.
- Crew system untouched (not replaced by jams; complementary).
- Push notifications — no new push category for jam events in v1.
  The active-jam banner is the in-app equivalent. Push for
  "jam ended" or "someone joined your jam" is a fast-follow if
  desired.
- Admin dashboard — jams are out-of-gym; no gym-admin visibility
  into jam activity, even when a jam happens "at" a gym. Gyms
  don't own jams.

---

## 14. Risk notes

- **Realtime**: introducing Supabase realtime for the first time in
  the app. Channel state management, cleanup, reconnection all need
  end-to-end verification on flaky networks. Budget for a day of
  cross-device testing in phase 4.
- **end_jam transactional scope**: the single RPC does aggregation
  + insert + delete across 4 tables. If it fails mid-transaction,
  Postgres rolls back cleanly, but the user sees an "end failed"
  toast. Monitor for perf; 20 players × ~50 routes × ~1000 logs
  upper bound is still sub-millisecond.
- **Iron Crew query**: pair-max approach is O(P²) in co-players.
  For a user who's jammed with hundreds of people, still fast. If
  it becomes slow, replace with a materialised per-pair counter
  similar to `user_set_stats`.
- **QR scanner fallback**: BarcodeDetector isn't universally
  supported. Test on iOS Safari (the PWA primary surface) — current
  Safari has it, but fallback (manual code entry) must always work.
- **Zombie jams**: `end_stale_jams` cron is the net. If `pg_cron`
  doesn't fire for some reason, abandoned jams accumulate — add a
  manual "abandon my jam" button in settings if this becomes a real
  problem.

---

**End of plan.** Review, flag the open questions in §11, and confirm
before build begins.
