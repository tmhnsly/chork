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
| 023 | `grade_vote_clamp.sql` | CHECK (1 ≤ `route_logs.grade_vote` ≤ 30) — defence in depth against a malformed client payload storing garbage ratings |
| 024 | `push_subscriptions_hardening.sql` | Tighten RLS on `push_subscriptions` to self-only + unique `(user_id, endpoint)` — prevents duplicate rows per device and cross-user reads |
| 025 | `hardening.sql` | CHECK (`route_logs.attempts` 0..999); composite index `crew_members(user_id, status)` |
| 026 | `denormalise_community_grade.sql` | `routes.community_grade` + `grade_vote_count` cols + trigger on `route_logs` that keeps them fresh. Admin dashboard reads these denorms instead of re-aggregating every render |
| 027 | `fuzzy_climber_search.sql` | `pg_trgm` extension in `extensions` schema, GIN trigram indexes on `profiles.username` + `name`, `search_climbers_fuzzy(query, caller_id, limit)` RPC. Schema-qualified (`extensions.word_similarity()`) because SECURITY DEFINER sets `search_path = ''` |
| 028 | `user_theme_preference.sql` | `profiles.theme text not null default 'default'`. No CHECK (the theme list is app-owned; adding a palette wouldn't require a migration) |
| 029 | `crew_activity_feed_scope.sql` | Overload `get_crew_activity_feed(p_crew_id, limit, before)` — same signature with a leading crew id scopes the feed to one crew. Caller-membership gate so a stale URL can't leak another crew's feed |
| 030 | `crew_member_previews.sql` | `get_crew_member_previews(p_crew_ids, p_limit)` — batch first-N members per crew for the /crew picker avatar stacks. Replaces N per-crew round-trips |
| 031 | `crew_ownership_transfer.sql` | Tight UPDATE policy on `crews` — only the current creator can update the row, and only to an existing active member. Enables `transferCrewOwnership` |
| 032 | `push_category_prefs.sql` | `profiles.push_invite_received`, `push_invite_accepted`, `push_ownership_changed` (bool, default true). `sendPushToUsers` filters recipients by the matching column when a category is supplied |
| 033 | `notifications_log.sql` | `notifications(user_id, kind, payload jsonb, read_at, created_at)` + RLS (read/update/delete own only, no client insert). `notify_user(user_id, kind, payload)` SECURITY DEFINER helper — three kinds at launch: `crew_invite_received`, `crew_invite_accepted`, `crew_ownership_transferred` |
| 034 | `gym_admins_tighten_select.sql` | Replace `gym_admins` open SELECT policy with scoped one (self OR fellow admin of the same gym). Previously any signed-in user could enumerate every gym's admin roster from the browser |
| 035 | `crew_member_counts.sql` | `get_crew_member_counts(p_crew_ids)` — server-side `count(*) group by crew_id` for the /crew picker. Previously `getMyCrews` streamed every row and tallied client-side |
| 036 | `profile_summary_rpc.sql` | `get_profile_summary(p_user_id, p_gym_id)` — one-call RPC returning per-set aggregates (from `user_set_stats`), active-set raw logs, and gym route count. Replaces the `getAllRouteDataForUserInGym` raw-log fetch + JS aggregation on `/u/[username]`. `is_gym_member(p_gym_id)` gate, `STABLE`, `SECURITY DEFINER`, `search_path = ''` |
| 037 | `gym_stats_rpc.sql` | `get_gym_stats_v2(p_gym_id, p_set_id default null)` — single RPC returning both all-time + set-scoped `{climbers, sends, flashes, routes}`. Replaces the two-call `getGymStats` pattern that fired 8 round trips per `/leaderboard` paint |
| 038 | `profile_summary_extended.sql` | Extends `get_profile_summary` payload with `total_attempts` + `unique_routes_attempted` (gym-scoped, indexed scans of `route_logs`). Lets `ProfileStats` derive every `allTimeExtras` field from one RPC instead of falling back to `getAllRouteDataForUserInGym` |
| 039 | `leaderboard_cached_rpcs.sql` | `get_leaderboard_set_cached`, `get_leaderboard_all_time_cached`, `get_gym_stats_v2_cached`. Drops the `is_gym_member` auth gate (which blocks the `unstable_cache` pattern under service-role), granted to `service_role` only. Page-level membership check moves into the cached wrapper. Set-belongs-to-gym cross-ownership stays inside the RPC as belt-and-braces. Enables the `getLeaderboardCached` / `getGymStatsV2Cached` Layer-2 wraps for cross-viewer cache sharing |
| 040 | `notify_user_service_role_only.sql` | Revoke execute on `notify_user(uuid, text, jsonb)` from `authenticated`; grant to `service_role` only. Previously any signed-in user could call the SECURITY DEFINER RPC with an arbitrary target uid + payload — a spoofing surface. `notifyUser` helper in `src/lib/notify.ts` now uses the service client internally |
| 041 | `jams_foundation.sql` | Jams feature live tables + RLS: `jams`, `jam_players`, `jam_grades`, `jam_routes`, `jam_logs`, `user_custom_scales`, `user_custom_scale_grades`. Helpers `is_jam_player`, `is_jam_host`. Activity-bump triggers on `jam_logs` / `jam_routes`. Core RPCs: `generate_jam_code` (service-role), `create_jam`, `join_jam_by_code`, `add_jam_player`, `leave_jam`, `add_jam_route`, `update_jam_route`, `upsert_jam_log`, `get_jam_state` (single-trip hydrator), `get_jam_leaderboard`, `get_active_jam_for_user` |
| 042 | `jam_summaries_and_end.sql` | Permanent summary tables: `jam_summaries`, `jam_summary_players`. `end_jam` RPC collapses live `jam_logs` + `jam_routes` + `jam_grades` + `jam_players` into a summary + per-player roll-up and deletes the live rows in one transaction (target ~1KB per completed jam). `end_jam_as_player` wrapper enforces caller-is-player. Hourly `pg_cron` sweep via `end_stale_jams` auto-closes jams with `last_activity_at < now() - 24h`. History RPCs: `get_user_jams` (paginated), `get_jam_summary` (detail), `get_user_saved_scales`, `get_user_all_time_stats` (gym + jam union), `get_jam_achievement_context` (pair-max heuristic for Iron Crew) |
| 043 | `jam_rpcs_nullable_args.sql` | Redeclare `create_jam` / `add_jam_route` / `update_jam_route` / `upsert_jam_log` with explicit `default null` on every optional parameter. No behaviour change — just propagates nullability into `supabase gen types` output so the app layer doesn't have to coerce null → empty string at every call site |

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
