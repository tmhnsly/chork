# Supabase Schema

Project: Supabase
Generated types: `src/lib/database.types.ts` (run `npx supabase gen types typescript`)
Migration: `supabase/migrations/001_initial_schema.sql`

---

## profiles

Extends `auth.users`. Auto-created by trigger on signup.

| Field          | Type      | Notes                                          |
| -------------- | --------- | ---------------------------------------------- |
| `id`           | uuid PK   | References auth.users(id)                      |
| `username`     | text      | Unique. Min 3 chars, `^[a-z0-9_]+$`           |
| `name`         | text      | Display name                                   |
| `avatar_url`   | text      | Full URL or empty string                       |
| `onboarded`    | boolean   | Default false                                  |
| `active_gym_id`| uuid FK   | User's currently selected gym                  |

---

## gyms

| Field       | Type    | Notes                                      |
| ----------- | ------- | ------------------------------------------ |
| `name`      | text    | Required                                   |
| `slug`      | text    | Unique. For future URL use                 |
| `city`      | text    | Optional                                   |
| `country`   | text    | Optional                                   |
| `logo_url`  | text    | Optional                                   |
| `is_listed` | boolean | Default true. Searchable in gym picker     |

---

## gym_memberships

| Field     | Type    | Notes                                            |
| --------- | ------- | ------------------------------------------------ |
| `user_id` | uuid FK | References profiles                              |
| `gym_id`  | uuid FK | References gyms                                  |
| `role`    | text    | `climber`, `setter`, `admin`, or `owner`         |

Unique: `(user_id, gym_id)`

---

## sets

| Field       | Type        | Notes                          |
| ----------- | ----------- | ------------------------------ |
| `gym_id`    | uuid FK     | Required. Scopes to a gym      |
| `starts_at` | timestamptz | Required                       |
| `ends_at`   | timestamptz | Required                       |
| `active`    | boolean     | Default false. One per gym     |

---

## routes

| Field      | Type    | Notes                          |
| ---------- | ------- | ------------------------------ |
| `set_id`   | uuid FK | References sets                |
| `number`   | integer | 1–N within a set               |
| `has_zone` | boolean | Default false                  |

Unique: `(set_id, number)`

---

## route_logs

One per user per route. Upserted in place.

| Field          | Type        | Notes                                  |
| -------------- | ----------- | -------------------------------------- |
| `user_id`      | uuid FK     | References profiles                    |
| `route_id`     | uuid FK     | References routes                      |
| `attempts`     | integer     | Default 0. Private to the user         |
| `completed`    | boolean     | Default false                          |
| `completed_at` | timestamptz | Set when completed                     |
| `grade_vote`   | smallint    | 0–10 (V0–V10). Null if no vote        |
| `zone`         | boolean     | Default false                          |

Unique: `(user_id, route_id)`

---

## comments

| Field       | Type    | Notes                          |
| ----------- | ------- | ------------------------------ |
| `user_id`   | uuid FK | References profiles            |
| `route_id`  | uuid FK | References routes              |
| `body`      | text    | 1–500 chars                    |
| `likes`     | integer | Denormalized count             |
| `parent_id` | uuid FK | Self-ref. Null = top-level     |

---

## comment_likes

| Field        | Type    | Notes                          |
| ------------ | ------- | ------------------------------ |
| `user_id`    | uuid FK | References profiles            |
| `comment_id` | uuid FK | References comments            |

Unique: `(user_id, comment_id)`

---

## activity_events

| Field      | Type    | Notes                                               |
| ---------- | ------- | --------------------------------------------------- |
| `user_id`  | uuid FK | References profiles                                 |
| `type`     | text    | `completed`, `flashed`, `beta_spray`, `reply`       |
| `route_id` | uuid FK | Optional                                            |

---

## RPC functions

- `get_route_grade(route_id)` — community grade (AVG of completed grade_votes)
- `get_user_set_stats(user_id, gym_id)` — per-set completions, flashes, points

---

## RLS summary

All tables have RLS enabled. Key patterns:
- **Gym data** (sets, routes, logs, comments): readable by gym members via `is_gym_member()` helper
- **Write operations**: own data only (`auth.uid() = user_id`)
- **Service role**: bypasses RLS for admin operations (like count updates, activity event deletes)
- **Profiles**: readable by any authenticated user
- **Gyms**: listed gyms readable by any authenticated user

---

## Points formula

Implemented in `src/lib/data/logs.ts` as `computePoints(log)`. Never stored.

| Condition            | Points |
| -------------------- | ------ |
| Flash (1 attempt)    | 4      |
| 2 attempts           | 3      |
| 3 attempts           | 2      |
| 4+ attempts          | 1      |
| Not completed        | 0      |
| Zone hold            | +1     |
