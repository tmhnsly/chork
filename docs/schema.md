# PocketBase schema

Instance: `https://chork.pockethost.io/`
Generated types: `src/lib/pocketbase-types.ts` (run `pnpm typegen` after any schema change)

---

## users (auth collection)

Default PocketBase auth fields plus:

| Field      | Type | Notes                                      |
| ---------- | ---- | ------------------------------------------ |
| `name`     | text | Display name                               |
| `username` | text | Unique. Always shown with `@` prefix in UI |
| `avatar`   | file | Single file                                |

---

## sets

| Field       | Type | Notes                                                                                              |
| ----------- | ---- | -------------------------------------------------------------------------------------------------- |
| `starts_at` | date | Required. Use as the set identifier — no name field                                                |
| `ends_at`   | date | Required                                                                                           |
| `active`    | bool | Default false. Only one set should be active at a time — enforced by convention, not DB constraint |

Display label derived from `starts_at` using date-fns:

- Short: `"APR 7"` — `format(parseISO(set.starts_at), 'MMM d').toUpperCase()`
- Range: `"APR 7 – MAY 4"`

API rules: list/view = `@request.auth.id != ""`. Create/update/delete = empty (admin only).

---

## routes

| Field      | Type            | Notes                                                           |
| ---------- | --------------- | --------------------------------------------------------------- |
| `set_id`   | relation → sets | Required, single                                                |
| `number`   | number          | Required. 1–N within a set, no gaps                             |
| `has_zone` | bool            | Default false. If true, users can log a zone hold on this route |

API rules: list/view = `@request.auth.id != ""`. Create/update/delete = empty (admin only).

---

## route_logs

One record per user per route. Updated in place.

| Field          | Type              | Notes                                                      |
| -------------- | ----------------- | ---------------------------------------------------------- |
| `user_id`      | relation → users  | Required, single                                           |
| `route_id`     | relation → routes | Required, single                                           |
| `attempts`     | number            | Default 0. Private — never shown to other users            |
| `completed`    | bool              | Default false                                              |
| `completed_at` | date              | Optional. Set when completed                               |
| `grade_vote`   | number            | Optional. 0–10 (V0–V10). Only valid when completed         |
| `zone`         | bool              | Default false. Can be true regardless of completion status |

Unique index: `(user_id, route_id)`

Derived fields (never stored):

- `isFlash`: `attempts === 1 && completed === true`
- `points`: see points formula below

API rules:

- List/view: `@request.auth.id != ""`
- Create: `@request.auth.id != ""`
- Update: `@request.auth.id = user_id`
- Delete: `@request.auth.id = user_id`

---

## comments

Beta spray comments. Threaded via self-referential `parent_id`. Fetch all comments for a route in one query and build the tree client-side using `buildCommentTree()` in `src/lib/data/comments.ts`. Cap visual rendering at 3 levels deep.

| Field       | Type                | Notes                                                             |
| ----------- | ------------------- | ----------------------------------------------------------------- |
| `user_id`   | relation → users    | Required, single                                                  |
| `route_id`  | relation → routes   | Required, single                                                  |
| `body`      | text                | Required                                                          |
| `likes`     | number              | Default 0. Denormalized count, maintained via admin PB instance on like/unlike |
| `parent_id` | relation → comments | Optional, single. Null = top-level beta spray. Populated = reply. |

Replies can have replies. One query fetches all, tree is built client-side.
Comments are sorted by `-likes, -created` (most liked first, then newest).

API rules:

- List/view: `@request.auth.id != ""`
- Create: `@request.auth.id != ""`
- Update/delete: `@request.auth.id = user_id`

---

## comment_likes

One record per user per comment. Toggle creates or deletes the record and atomically increments/decrements `comments.likes` via an admin PB instance (because the comments update API rule restricts to the comment owner).

| Field        | Type                | Notes          |
| ------------ | ------------------- | -------------- |
| `user_id`    | relation → users    | Required, single |
| `comment_id` | relation → comments | Required, single |

Unique index: `(user_id, comment_id)`

API rules:

- List/view: `@request.auth.id != ""`
- Create: `@request.auth.id != ""`
- Delete: `@request.auth.id = user_id`

---

## activity_events

Append-only. Never update or delete rows.

| Field      | Type              | Notes                                                  |
| ---------- | ----------------- | ------------------------------------------------------ |
| `user_id`  | relation → users  | Required, single                                       |
| `type`     | select (single)   | Required. Values: `completed`, `flashed`, `beta_spray` |
| `route_id` | relation → routes | Optional, single                                       |

API rules:

- List/view: `@request.auth.id != ""`
- Create: `@request.auth.id != ""`
- Update/delete: empty

---

## route_grades (view collection)

Live aggregation over `route_logs`. Returns the community grade for each route.
Not stored — PocketBase runs the query on every request against the underlying table.

| Field             | Type   | Notes                                         |
| ----------------- | ------ | --------------------------------------------- |
| `id`              | text   | Same as `route_id` (used as PK by PocketBase) |
| `route_id`        | text   | The route this grade belongs to                |
| `community_grade` | number | `ROUND(AVG(grade_vote))` from completed logs   |
| `vote_count`      | number | How many completed logs have a grade vote       |

Source query:

```sql
SELECT
  route_id AS id,
  route_id,
  ROUND(AVG(grade_vote)) AS community_grade,
  COUNT(grade_vote) AS vote_count
FROM route_logs
WHERE completed = TRUE
  AND grade_vote IS NOT NULL
GROUP BY route_id
```

API rules: list/view = `@request.auth.id != ""`. Read-only (view).

Used by: `getRouteGrade()` in `src/lib/data/sets.ts` — called when the RouteLogSheet opens.
Replaces: fetching all completed logs for a route and averaging in JS.

---

## user_set_stats (view collection)

Live aggregation over `route_logs` joined with `routes`. Returns per-user, per-set stats.
Not stored — PocketBase runs the query on every request against the underlying tables.

| Field         | Type   | Notes                                              |
| ------------- | ------ | -------------------------------------------------- |
| `id`          | number | Synthetic PK via `ROW_NUMBER() OVER()`             |
| `user_id`     | text   | The user                                            |
| `set_id`      | text   | The set (via routes.set_id join)                    |
| `completions` | number | Count of completed logs                             |
| `flashes`     | number | Count of completed logs where attempts = 1          |
| `points`      | number | Sum of points using the standard formula + zone bonus |

Source query:

```sql
SELECT
  (ROW_NUMBER() OVER()) AS id,
  rl.user_id AS user_id,
  r.set_id AS set_id,
  SUM(CASE WHEN rl.completed = TRUE THEN 1 ELSE 0 END) AS completions,
  SUM(CASE WHEN rl.completed = TRUE AND rl.attempts = 1 THEN 1 ELSE 0 END) AS flashes,
  SUM(
    (CASE
      WHEN rl.completed = TRUE AND rl.attempts = 1 THEN 4
      WHEN rl.completed = TRUE AND rl.attempts = 2 THEN 3
      WHEN rl.completed = TRUE AND rl.attempts = 3 THEN 2
      WHEN rl.completed = TRUE THEN 1
      ELSE 0
    END) + (CASE WHEN rl.zone = TRUE THEN 1 ELSE 0 END)
  ) AS points
FROM route_logs rl
LEFT JOIN routes r ON r.id = rl.route_id
GROUP BY rl.user_id, r.set_id
```

API rules: list/view = `@request.auth.id != ""`. Read-only (view).

Used by: `getUserSetStats()` in `src/lib/data/sets.ts` — called on the profile page.
Replaces: fetching all logs for a user with expanded route data and grouping/summing in JS.

---

## Indexes

Composite indexes added to speed up filtered + sorted queries at scale.

| Collection        | Columns              | Type   | Purpose                                  |
| ----------------- | -------------------- | ------ | ---------------------------------------- |
| `route_logs`      | `(user_id, route_id)` | Unique | Upsert lookups, one-log-per-user-per-route |
| `route_logs`      | `(route_id, completed)` | Regular | Grade aggregation, route stats           |
| `routes`          | `(set_id, number)`   | Regular | Fetch routes by set, sorted by number    |
| `comments`        | `(route_id, likes, created)` | Regular | Comments sorted by most liked, then newest |
| `comment_likes`   | `(user_id, comment_id)` | Unique | One like per user per comment             |
| `activity_events` | `(user_id, created)` | Regular | Recent activity feed for a user          |

---

## Points formula

Implemented in `src/lib/data/logs.ts` as `computePoints(log)`. Never stored.

| Condition                             | Points                                  |
| ------------------------------------- | --------------------------------------- |
| `attempts === 1 && completed` (flash) | 4                                       |
| `attempts === 2 && completed`         | 3                                       |
| `attempts === 3 && completed`         | 2                                       |
| `attempts >= 4 && completed`          | 1                                       |
| not completed                         | 0                                       |
| `zone === true`                       | +1 (added on top of above, including 0) |

Zone is independent of completion — a user can earn the zone bonus without sending the route.
