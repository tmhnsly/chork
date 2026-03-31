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
| `parent_id` | relation → comments | Optional, single. Null = top-level beta spray. Populated = reply. |

Replies can have replies. One query fetches all, tree is built client-side.

API rules:

- List/view: `@request.auth.id != ""`
- Create: `@request.auth.id != ""`
- Update/delete: `@request.auth.id = user_id`

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
