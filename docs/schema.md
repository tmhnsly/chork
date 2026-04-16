# Supabase schema

Current state as of migration 035. For the historical sequence, see
`docs/migrations.md`.

Types regenerated via:
```bash
npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
```

---

## Core climber data

### profiles

Extends `auth.users`. Auto-created by the `handle_new_user` trigger
on signup.

| Field                | Type         | Notes |
|---|---|---|
| `id`                 | uuid PK      | References `auth.users(id)` |
| `username`           | text unique  | Min 3 chars, `^[a-z0-9_]+$` |
| `name`               | text         | Display name, ≤80 chars |
| `avatar_url`         | text         | Full URL or empty string |
| `onboarded`          | boolean      | Default false |
| `active_gym_id`      | uuid FK      | Current gym context |
| `allow_crew_invites` | boolean      | Default true. Hides user from global search when false |
| `invites_sent_today` | integer      | Daily invite counter (≥ 0) |
| `invites_sent_date`  | date         | Date the counter applies to |
| `theme`              | text         | One of the app-owned palette ids (`default` / `slate` / `sand` / `gray` / `mauve` / `sage`). No DB CHECK — adding palettes is an app-layer change |
| `push_invite_received`   | boolean | Default true. Mute new-invite pushes |
| `push_invite_accepted`   | boolean | Default true. Mute accept-confirmation pushes |
| `push_ownership_changed` | boolean | Default true. Mute ownership-transfer pushes |

### gyms

| Field        | Type        | Notes |
|---|---|---|
| `name`       | text        | Required |
| `slug`       | text unique | For future URL use |
| `city`       | text        | Optional |
| `country`    | text        | Optional |
| `logo_url`   | text        | Optional |
| `is_listed`  | boolean     | Default true. Searchable in gym picker |
| `plan_tier`  | text        | `starter` / `pro` / `enterprise` |

### gym_memberships

`(user_id, gym_id, role)`. `role ∈ {climber, setter, admin, owner}`.
**Largely cosmetic now** — the real admin surface reads from
`gym_admins`. Unique on `(user_id, gym_id)`.

### gym_admins

Separate admin table introduced in migration 014. A user can be both
a climber (via `gym_memberships`) AND an admin (via `gym_admins`)
of the same gym simultaneously.

| Field     | Type    | Notes |
|---|---|---|
| `gym_id`  | uuid FK | |
| `user_id` | uuid FK | |
| `role`    | text    | `admin` / `owner`. Owners can manage other admins |

Unique `(gym_id, user_id)`.

### gym_invites

Token-based admin invitation flow. 14-day expiry.

| Field         | Type        | Notes |
|---|---|---|
| `gym_id`      | uuid FK     | |
| `email`       | text        | Recipient |
| `token`       | text unique | Opaque URL-safe base64 |
| `role`        | text        | `admin` / `owner` |
| `invited_by`  | uuid FK     | Profile who sent it |
| `accepted_at` | timestamptz nullable | Retained for audit after redemption |
| `expires_at`  | timestamptz | Default now() + 14 days |

One open invite per `(gym_id, email)`.

---

## Competition data

### sets

| Field            | Type                 | Notes |
|---|---|---|
| `gym_id`         | uuid FK              | Required |
| `name`           | text nullable        | Display name; falls back to date range |
| `status`         | text                 | `draft` / `live` / `archived`. Source of truth |
| `active`         | boolean              | Derived from `status = 'live'` by trigger — legacy readers only |
| `starts_at`      | timestamptz          | |
| `ends_at`        | timestamptz          | |
| `grading_scale`  | text                 | `v` / `font` / `points` |
| `max_grade`      | smallint             | 0..30. Bounds the climber-side grade slider |
| `competition_id` | uuid FK nullable     | Links to `competitions` |
| `closing_event`  | boolean              | Final-round flag |
| `venue_gym_id`   | uuid FK nullable     | Where the closing event is held |

Scheduled auto-publish: `pg_cron` runs `auto_publish_due_sets()` every
5 min, flipping `draft → live` for any set with `starts_at <= now()`.

### routes

| Field         | Type          | Notes |
|---|---|---|
| `set_id`      | uuid FK       | |
| `number`      | integer       | Must be `> 0`. Unique within a set |
| `has_zone`    | boolean       | |
| `setter_name` | text nullable | Internal only; never shown to climbers |

Unique `(set_id, number)`.

### route_logs

One per user per route. Upserted in place.

| Field          | Type        | Notes |
|---|---|---|
| `user_id`      | uuid FK     | |
| `route_id`     | uuid FK     | |
| `gym_id`       | uuid FK     | Denormalised for RLS (no joins) |
| `attempts`     | integer ≥ 0 | Private to the user |
| `completed`    | boolean     | |
| `completed_at` | timestamptz | Set when completed |
| `grade_vote`   | smallint    | 0..30. Null if no vote. Bound relaxed from the original 0..10 in migration 014 |
| `zone`         | boolean     | |

Unique `(user_id, route_id)`. Indexed on `user_id`, `(route_id, completed)`, `gym_id`.

### user_set_stats

Materialised aggregate maintained by a trigger on `route_logs`.
Every leaderboard RPC reads from here — never from raw `route_logs`.

| Field     | Type        | Notes |
|---|---|---|
| `user_id` | uuid FK     | |
| `set_id`  | uuid FK     | |
| `gym_id`  | uuid FK     | |
| `sends`   | integer ≥ 0 | Count of `completed = true` logs on the set |
| `flashes` | integer ≥ 0 | Count of completed + attempts = 1 |
| `zones`   | integer ≥ 0 | Count of zone = true |
| `points`  | integer ≥ 0 | Sum of `computePoints` across logs |

PK `(user_id, set_id)`.

### route_tags + route_tags_map

Extensible tag catalogue. Seeded with 8 tags (overhang, slab,
vertical, roof, compression, crack, crimp, sloper).

- `route_tags(id, slug unique, name)` — read-only to authenticated,
  curated via migrations
- `route_tags_map(route_id, tag_id)` — admin of the gym that owns
  the route may insert / delete, via `is_admin_of_route(route_id)`

### competitions

| Field          | Type                 | Notes |
|---|---|---|
| `name`         | text                 | 1..120 chars |
| `description`  | text nullable        | |
| `starts_at`    | timestamptz          | |
| `ends_at`      | timestamptz nullable | Open-ended allowed |
| `status`       | text                 | `draft` / `live` / `archived` |
| `organiser_id` | uuid FK nullable     | `profiles.id` of the organiser |

### competition_gyms / competition_categories / competition_participants

Many-to-many links. Climbers self-select a category via
`competition_participants(competition_id, user_id, category_id)`.

---

## Social layer (crews)

Replaced the old follow / follower system entirely in migration 020.

### crews

| Field        | Type    | Notes |
|---|---|---|
| `name`       | text    | 1..60 chars |
| `created_by` | uuid FK | Trigger seats them as the first active member |

### crew_members

| Field        | Type    | Notes |
|---|---|---|
| `crew_id`    | uuid FK | |
| `user_id`    | uuid FK | |
| `invited_by` | uuid FK | |
| `status`     | text    | `pending` / `active` |

Unique `(crew_id, user_id)`. A user can delete their own row at any
time — accept + leave share the DELETE policy.

### blocked_users

| Field        | Type    | Notes |
|---|---|---|
| `blocker_id` | uuid FK | |
| `blocked_id` | uuid FK | |

Unique `(blocker_id, blocked_id)`. Self-block rejected via CHECK.

---

## Engagement / events

### comments

| Field       | Type             | Notes |
|---|---|---|
| `user_id`   | uuid FK          | |
| `route_id`  | uuid FK          | |
| `gym_id`    | uuid FK          | Denormalised |
| `body`      | text             | 1..500 chars |
| `likes`     | integer          | Denormalised count |
| `parent_id` | uuid FK nullable | Self-reference. Threaded replies (UI not yet built) |

### comment_likes

`(user_id, comment_id, gym_id)`. Unique `(user_id, comment_id)`.

### activity_events

| Field      | Type             | Notes |
|---|---|---|
| `user_id`  | uuid FK          | |
| `type`     | text             | `completed` / `flashed` / `beta_spray` / `reply` |
| `route_id` | uuid FK nullable | |
| `gym_id`   | uuid FK nullable | Null for user-level events |

---

## Achievements

### user_achievements

Persistent `earned_at` per `(user_id, badge_id)`. Badge definitions
stay in TS (`src/lib/badges.ts`) — only the timestamp is stored.
Unique `(user_id, badge_id)`.

---

## PWA push

### push_subscriptions

| Field        | Type          | Notes |
|---|---|---|
| `user_id`    | uuid FK       | |
| `endpoint`   | text          | |
| `p256dh`     | text          | |
| `auth`       | text          | |
| `user_agent` | text nullable | |

Unique `(user_id, endpoint)`. User manages own rows; service role
dispatches via `sendPushToUsers`. Category opt-out lives on
`profiles.push_*` (migration 032) — dispatcher filters recipients
before firing.

### notifications

Persistent in-app log of every push-worthy event (migration 033).
Push is best-effort; the log survives OS dropouts, un-subscribed
devices, and missed focus.

| Field        | Type        | Notes |
|---|---|---|
| `user_id`    | uuid FK     | Owner |
| `kind`       | text        | Closed set: `crew_invite_received`, `crew_invite_accepted`, `crew_ownership_transferred`. DB check constraint + TS union kept in sync |
| `payload`    | jsonb       | Typed per-kind in `src/lib/data/notifications.ts`. Denormalised (crew name, counterpart username) for zero-join reads |
| `read_at`    | timestamptz | Null = unread; set by `markAllNotificationsRead` |
| `created_at` | timestamptz | |

Indexed `(user_id)`, partial `(user_id, created_at desc) where
read_at is null`, and `(created_at desc)`. RLS: users read / update
/ delete their own rows only. No INSERT policy — writes via the
`notify_user(p_user_id, p_kind, p_payload)` SECURITY DEFINER helper.

---

## RPC functions

Every function is `SECURITY DEFINER` with `search_path = ''`,
explicit `grant execute … to authenticated`, and `revoke … from
anon, public`. Access is gated inside each function (typically
`is_gym_member` / `is_gym_admin` / `is_competition_organiser`).

### Climber-facing

- `get_profile_summary(user_id, gym_id)` — one-call profile RPC
  (migration 036, extended in 038). Payload:
  `{ per_set: [{set_id, sends, flashes, zones, points}], active_set_detail: [{route_id, attempts, completed, zone}], total_routes_in_gym, total_attempts, unique_routes_attempted }`.
  Replaces the raw-log fetch + JS aggregation that used to drive
  `/u/[username]`
- `get_gym_stats_v2(gym_id, set_id default null)` — single RPC
  returning both `all_time` and `set` blocks of `{climbers, sends,
  flashes, routes}` (migration 037). Replaces the two `getGymStats`
  calls that fired 8 round trips per `/leaderboard` paint
- `get_leaderboard_set_cached` / `get_leaderboard_all_time_cached` /
  `get_gym_stats_v2_cached` — service-role variants (migration 039)
  with the `is_gym_member` gate dropped. Granted to `service_role`
  only; revoked from `authenticated`, `anon`, `public`. Called
  inside `unstable_cache` bodies via `createCachedContextClient`.
  Membership check shifts to the page level (`requireAuth` enforces
  `gymId === profile.active_gym_id`). Set-belongs-to-gym
  cross-ownership stays inside the RPC as belt-and-braces
- `get_route_grade(route_id)` — community grade average
- `get_user_set_stats(user_id, gym_id)` — per-set climber aggregates
- `get_leaderboard_set(gym_id, set_id, limit, offset)`
- `get_leaderboard_all_time(gym_id, limit, offset)`
- `get_leaderboard_neighbourhood(gym_id, user_id, set_id?)`
- `get_leaderboard_user_row(gym_id, user_id, set_id?)`
- `increment_comment_likes(comment_id, delta)` — atomic; clamped to ±1
- `get_competition_leaderboard(comp_id, category_id?, limit, offset)`

### Admin dashboard

- `get_set_overview(set_id)`
- `get_top_routes(set_id, limit)`
- `get_active_climber_count(set_id)`
- `get_engagement_trend(gym_id, limit)`
- `get_flash_leaderboard_set(set_id, limit)`
- `get_zone_send_ratio(set_id)`
- `get_community_grade_distribution(set_id)` — per-route histogram
- `get_setter_breakdown(set_id)` — per setter_name aggregate
- `get_all_time_overview(gym_id)`
- `get_competition_venue_stats(comp_id)` — organiser cross-gym view

### Crew

- `get_crew_leaderboard(crew_id, set_id, limit, offset)` — unranked
  members appear at the bottom with rank = null
- `get_crew_activity_feed(limit, before)` — cursor-paginated union
  across the caller's active crews; excludes caller's own events
- `get_crew_activity_feed(crew_id, limit, before)` — same, scoped
  to one crew; RPC gates on active membership (migration 029)
- `get_crew_member_previews(crew_ids[], limit)` — first-N active
  members per crew for the picker avatar stacks (migration 030)
- `get_crew_member_counts(crew_ids[])` — server-side member counts
  for the picker cards (migration 035)
- `bump_invite_rate_limit()` — atomic daily-cap bump (10/day);
  auto-resets on new UTC date

### Notifications

- `notify_user(user_id, kind, payload)` — SECURITY DEFINER insert
  helper used by server actions. Validates `kind` against the same
  closed set as the table check constraint (migration 033)

### Search

- `search_climbers_fuzzy(query, caller_id, limit)` — pg_trgm
  word-similarity search over `profiles.username` + `name`, pre-filtered
  against block + opt-out + shared-crew exclusions (migration 027)

### Admin operations

- `auto_publish_due_sets()` — called by `pg_cron` every 5 min to flip
  draft → live on past-start sets
- `resolve_admin_invite(token)` — returns invite row with SQL-computed
  `expired` / `accepted` booleans
- `sync_user_set_stats()` — trigger body; keeps `user_set_stats` in
  sync with `route_logs` writes
- `sync_sets_active()` — trigger body; keeps `sets.active` in sync
  with `sets.status`

### Role helpers (used inside RLS policies)

- `is_gym_member(gym_id)`
- `is_gym_admin(gym_id)` — reads `gym_admins`, NOT `gym_memberships.role`
- `is_gym_owner(gym_id)` — reads `gym_admins.role = 'owner'`
- `is_competition_organiser(competition_id)`
- `is_admin_of_route(route_id)` — `gym_admins` lookup via route → set → gym
- `is_active_crew_member(crew_id)`
- `crew_member_status(crew_id)` → `pending` / `active` / null
- `is_blocking(blocker_id, blocked_id)`

---

## RLS summary

All tables have RLS enabled. Key patterns (see migration 012 for the
hardening pass that unified them):

- `(select auth.uid())` everywhere — never bare `auth.uid()`
- **Gym data** (sets, routes, logs, comments) gated by
  `is_gym_member(gym_id)` on SELECT. Writes additionally require
  `user_id = (select auth.uid())`
- **Admin data** gated by `is_gym_admin(gym_id)` through the server
  action's `requireGymAdmin()`, with RLS as the second layer
- **Crews**: read own crew_member row always; read everyone's row
  in any crew you're active in; insert = invite (requires caller
  active in crew); delete = decline/leave (own row); update = accept
  (own row)
- **Blocks**: only the blocker reads / inserts / deletes their blocks
- **Profiles**: readable by any authenticated user; updatable only
  by self
- **Push subscriptions**: user fully owns their subscriptions

---

## Points formula

Implemented in `src/lib/data/logs.ts` as `computePoints(log)`. Never
stored.

| Condition          | Points |
|---|---|
| Flash (1 attempt)  | 4      |
| 2 attempts         | 3      |
| 3 attempts         | 2      |
| 4+ attempts        | 1      |
| Not completed      | 0      |
| Zone hold          | +1 (regardless of completion) |

`get_route_grade()` returns the community-graded average —
`round(avg(grade_vote))::integer` across completed logs with a
non-null grade vote.
