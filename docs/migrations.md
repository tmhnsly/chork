# Migration catalogue

One-line-per-file so future-you (and agents) can scan the history
without opening 22 SQL files.

Apply all pending migrations: `npx supabase db push`.
Regenerate types after any apply: `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts`.

---

## Applied (in order)

| # | File | Purpose |
|---|---|---|
| 001 | `initial_schema.sql` | Core tables: profiles, gyms, gym_memberships, sets, routes, route_logs, comments, comment_likes, activity_events. Initial RLS. `handle_new_user` trigger. `get_route_grade` + `get_user_set_stats` RPCs. Yonder seed gym |
| 002 | `add_gym_id_to_route_logs.sql` | Denormalise `gym_id` onto route_logs / comments / activity_events / comment_likes. Simplifies RLS to a direct column check instead of routes→sets joins |
| 003 | `atomic_likes_and_archived_set_policy.sql` | `increment_comment_likes` RPC. Replaces comment-like read-then-write race. Blocks inserts into archived sets at RLS |
| 004 | `follows.sql` | **[Removed in 020]** follows table + denormalised counts + update trigger |
| 005 | `leaderboard_rpc.sql` | `get_leaderboard_{set,all_time,neighbourhood,user_row}`. Dense-rank over points/flashes/sends |
| 006 | `security_hardening.sql` | Cross-gym leak fixes in leaderboard RPCs. `p_set_id` must belong to `p_gym_id`. `increment_comment_likes` gym-member gate |
| 007 | `fix_activity_events_rls.sql` | Re-applies the null-route activity_events policy with the correct name (006 had the wrong name and silently no-op'd) |
| 008 | `backend_hardening.sql` | `search_path = ''` on every SECURITY DEFINER function. Explicit authenticated grants / anon revokes. `increment_comment_likes` clamps delta to ±1. Leaderboard RPCs cap `p_limit` at 100. `profiles.name` length constraint |
| 009 | `route_logs_user_index.sql` | Index on `route_logs(user_id)` — speeds up "all my logs at this gym" queries |
| 010 | `user_achievements.sql` | Persistent `earned_at` storage for badges. Badge definitions stay in TS; only the earned timestamp lives in the DB |
| 011 | `sets_ends_at_index.sql` | Composite `(gym_id, ends_at)` index. Supports the profile-page filter that hides sets ending before the user joined |
| 012 | `db_hardening_rls_indexes_constraints.sql` | Wrap every bare `auth.uid()` in `(select auth.uid())`. Drop duplicate INSERT policy on route_logs (silent archived-set bypass). Add `is_gym_admin` / `is_gym_owner` helpers. FK indexes on `profiles.active_gym_id`, `comments.user_id`, `comments.parent_id`, `comment_likes.comment_id`, `activity_events.route_id`. CHECK constraints on route.number, attempts, follower counts |
| 013 | `user_set_stats_materialized.sql` | Materialised `user_set_stats(user_id, set_id, gym_id, sends, flashes, zones, points)` with trigger-maintained aggregates. Rewrites every leaderboard RPC to read from it |
| 014 | `admin_foundation.sql` | Admin platform: `gym_admins`, `gym_invites`, `competitions`, `competition_gyms`, `competition_categories`, `competition_participants`, `route_tags`, `route_tags_map`, `push_subscriptions`. New cols on sets (name, status, grading_scale, max_grade, competition_id, closing_event, venue_gym_id), routes (setter_name), gyms (plan_tier). Helpers `is_competition_organiser`, `is_admin_of_route`. `is_gym_admin` rewritten to read from `gym_admins`. Seeds 8 route tags |
| 015 | `sets_auto_publish_schedule.sql` | `pg_cron` extension + `auto_publish_due_sets()` scheduled every 5 min — flips `draft → live` when `starts_at` passes |
| 016 | `resolve_admin_invite_rpc.sql` | `resolve_admin_invite(token)` returns the invite row plus SQL-computed `expired` / `accepted` booleans. Avoids render-path `Date.now()` and clock skew between Node and Postgres |
| 017 | `competition_leaderboard_rpc.sql` | `get_competition_leaderboard(comp_id, category_id?, limit, offset)` — aggregates user_set_stats across every set in the comp with optional category filter |
| 018 | `admin_dashboard_rpcs.sql` | 9 dashboard RPCs: `get_set_overview`, `get_top_routes`, `get_active_climber_count`, `get_engagement_trend`, `get_flash_leaderboard_set`, `get_zone_send_ratio`, `get_community_grade_distribution`, `get_setter_breakdown`, `get_all_time_overview` |
| 019 | `competition_venue_stats_rpc.sql` | `get_competition_venue_stats(comp_id)` — per-gym activity breakdown for the organiser dashboard |
| 020 | `remove_follows.sql` | Drop the follows table + related trigger + function. Drop `profiles.follower_count` and `profiles.following_count`. Replaced by crews (021) |
| 021 | `crews_foundation.sql` | `crews`, `crew_members`, `blocked_users` tables. Profile cols `allow_crew_invites`, `invites_sent_today`, `invites_sent_date`. Helpers `is_active_crew_member`, `crew_member_status`, `is_blocking`. Atomic rate-limit RPC `bump_invite_rate_limit` (10/day). Trigger `seat_crew_creator` |
| 022 | `crew_leaderboard_rpc.sql` | `get_crew_leaderboard(crew_id, set_id, limit, offset)` (ranks active members on a gym set; unranked at bottom). `get_crew_activity_feed(limit, before)` cursor-paginated union feed across the caller's crews |

---

## Conventions

- **Filename pattern**: `<zero-padded-number>_<snake_case_summary>.sql`
- **Every new table gets RLS enabled in the same migration that creates it.**
  No "add RLS later" migrations — they're a guaranteed foot-gun
- **Every FK column gets an index.** Supabase lint 0001
- **Every SECURITY DEFINER function sets `search_path = ''`.** Prevents
  schema injection. Every new one must also have explicit
  `grant execute ... to authenticated` + `revoke ... from anon, public`
- **RLS expressions wrap `auth.uid()` in `(select auth.uid())`.**
  Postgres caches it once per query instead of re-evaluating per row
- **Destructive changes land in their own migration.** Adding columns
  and dropping columns mix poorly; roll each separately so partial
  applies stay recoverable
- **Backfill inline with DDL where possible.** Migration 002 is the
  canonical example — add column nullable, `UPDATE … FROM` to
  backfill, then `ALTER TABLE … SET NOT NULL`

---

## Running migrations

```bash
# Staged apply — preview what's about to run
npx supabase db push --dry-run

# Apply
npx supabase db push

# Then always regenerate types
npx supabase gen types typescript --project-id cfyagiwtzrgfjtwaevlh \
  > src/lib/database.types.ts
```

If types are missing a column / RPC, the TS compiler will fail at the
call site rather than a cryptic runtime error. That failure is the
cue to regenerate types.

---

## Rollback

We don't ship down-migrations. If a migration needs reverting:

1. Write a new forward migration that reverses it explicitly
2. Name it with the next number
3. Note it in the table above referencing the migration it reverses

Rationale: down-migrations are almost never tested and the production
database doesn't need two paths to manage. Forward-only keeps the
history honest.
