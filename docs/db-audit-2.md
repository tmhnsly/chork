# Chork — Supabase audit #2 (post-jams hardening)

> **Status:** Captured against migrations `055`–`059`, after the jam
> realtime/privacy work and the multi-pass app + schema audits.
> `docs/db-audit.md` covers the pre-admin pass (migrations 012–022);
> this doc picks up from where that left off. `docs/schema.md` is
> the always-current reference for schema questions.

Audit scope: schema sync, RLS correctness, query performance, index
coverage, pg_stat_statements hot-paths, and cron jobs — focused on
catching slippage as the codebase aged through migrations 023–059.

---

## Migrations shipped (055–059)

| # | What | Why |
|---|---|---|
| 055 | jam realtime publication + summary gate | Never-applied migration (root cause of "have to refresh to see new jam routes / other players' scores stuck at 0"). Added `jam_routes`, `jam_logs`, `jam_players` to `supabase_realtime` publication; set `REPLICA IDENTITY FULL` so DELETE events carry `jam_id` for filtering. Moved `get_jam_summary_for_user` participation gate inside the SECURITY DEFINER body (off the anon RLS path) to fix the "end-jam → 404 on summary" stale-JWT race. |
| 056 | idempotent realtime fixup + live-leaderboard attempts privacy | Wrapped 055's `alter publication add table` in `pg_publication_tables` existence checks so re-apply is safe. Masked `attempts` per-caller in `get_jam_leaderboard` to match the post-summary mask migration 052 applied — closes the equivalent privacy leak on the live RPC. Paired with client-side `visibleAttempts()` sanitisation in `JamScreen.onLogChange`. |
| 057 | `leave_crew_atomic` RPC | Closes TOCTOU in `leaveCrew`. Reads `crews.created_by` `FOR UPDATE`, branches on creator + active-count, deletes the crew OR the membership inside one transaction. Returns discriminated text (`'left'` / `'crew_deleted'` / `'creator_blocked'` / `'not_found'` / `'not_member'`). |
| 058 | dead-code cleanup | DROP'd `get_jam_state(uuid)` (broken — `row_to_jsonb(record)` is not a real function), `notifications_created_at_idx` (no user prefix → planner can't use it), `route_logs_gym` (0 scans, every real query filters by `user_id`). Replaced `sets_status_idx` (0 scans, wrong column order) with `sets_status_live_idx (gym_id) WHERE status='live'`. |
| 059 | partial index for `auto_publish_due_sets` cron | Added `sets_pending_publish_idx (starts_at) WHERE status='draft'`. **Outcome:** ineffective — see "Cron cost is platform overhead" below. The index is harmless (drafts are temporary, so it stays tiny) but the 6ms/call is pg_cron framework cost, not the seq scan we hypothesised. |

---

## Live-DB findings (`supabase inspect db`)

### Top consumers by total execution time

| Query | Calls | Total | Mean | Notes |
|---|---|---|---|---|
| `SELECT wal->>...` (Realtime publication scan) | 35,354 | 144s | 4.1ms | Supabase internal. Cost amplified by `REPLICA IDENTITY FULL` on jam tables (055). Required for jam-realtime; not actionable. |
| `auto_publish_due_sets()` cron | 9,558 | 57s | 5.96ms | Every-5-min cron × ~33 days. See "Cron cost" below. |
| `end_stale_jams()` cron | 690 | 13s | 18.96ms | Hourly cron. Time concentrated in the few runs that actually close jams (writing summaries). Search side already covered by `jams_stale_idx`. No optimisation available. |

### Cron cost is platform overhead

After migration 059 reset stats and added `sets_pending_publish_idx`,
`auto_publish_due_sets()` still ran at 6.49ms/call across 207 fresh
invocations. The seq scan was NOT the bottleneck — the cost is:

- pg_cron transaction setup
- Two `cron.job_run_details` row writes per fire (start + end)
- The `UPDATE` statement opens a write transaction even when zero
  rows match
- Function-call boilerplate

The added partial index will speed up the search when there ARE
drafts to publish, but most runs find none. Net 6ms/call → 1.7s/day,
acceptable.

**If we wanted to actually reduce this cost:** change the cron from
`*/5 * * * *` to `*/15 * * * *`. Sets are scheduled weeks ahead;
±15min publish precision is fine. Saves 2/3 of cron fires.
Deliberately not changing this in 059 — behaviour change, owner sign-off
needed. Noted here for the next audit pass.

### Index audit

Verified all proposed "missing composite index" candidates against
live `pg_stat_user_indexes`:

- `gym_memberships_user_id_gym_id_key` — **70,963 scans** (unique
  constraint auto-creates the index; audit was looking for a `_idx`
  suffix and missed it). No new index needed.
- `crew_members_user_status_idx` — already exists (1,979 scans).
- `jam_summary_players_summary_user_idx` — already exists (428 scans).
- `route_logs_user_idx` — already exists (3,126 scans), covers
  `getAllRouteDataForUserInGym` paths.

**Conclusion: schema is already well-indexed for the current query
mix.** What was actionable was dead-code cleanup (migration 058) +
the cron partial index (059, ineffective in practice).

### 0-scan indexes (kept conservatively)

~20 indexes show 0 scans in the live `index-stats` output. Most are
legitimate:

- `profiles_username_trgm_idx` / `profiles_name_trgm_idx` — used by
  search; not exercised in dev volume but production-load lights up
- `competition_*` indexes — feature is pre-launch
- Unique constraint indexes that protect INSERT integrity even
  without read traffic (`jam_routes_jam_id_number_key`, `route_tags_slug_key`)
- `jams_status_live_idx` partial — tiny, no cost, will see usage

**No drops planned** — `pg_stat_statements_reset()` ran during the
059 deploy, so fresh usage data is still accumulating. Revisit
after a production-traffic window (recommend 1–2 weeks) before
considering further pruning.

---

## App-side findings

Two consecutive audit passes (3rd + 4th) caught real slippage in
the recent commits:

- `revalidatePath("/crew")` in `postComment` — explicit CLAUDE.md
  violation that I'd left behind from an earlier Phase-2 migration.
  Fixed in commit `80a32e4`.
- `computeJamLifetimeStats.bestFinish` seeded from `jams[0].user_rank`
  → if that row was unranked (rank=0) every real podium finish was
  hidden by the `<` comparison. Fixed in commit `80a32e4`.
- `leaveCrew crew_deleted` test only asserted the return shape, not
  the `revalidateTag` calls. A regression that dropped the tag bust
  would have passed. Fixed in `80a32e4`.
- `inviteToCrew` rate-limit test never actually exercised Upstash
  (`hasUpstash` false in tests → `enforce()` short-circuits). Added
  explicit `@/lib/rate-limit` mock + targeted test in `80a32e4`.

The 5th and final pass found 2 real medium + 1 cosmetic + 1 follow-up
(commit `2c2fefa`): avatar MIME magic-byte check, push subscription
dedup, `declineCrewInvite` cache-bust guard on zero-row delete, and
the competition `revalidatePath` → `revalidateTag` conversion.

---

## What's deliberately not done

- **Onboarding-form reducer refactor.** Flagged as a candidate in
  the architecture-plan doc but on closer inspection the state
  fields are mostly INDEPENDENT (form inputs, wizard step, gym
  picker substate). Doesn't meet the "3+ coupled mutations" bar
  per the CLAUDE.md rule. A reducer here would be indirection
  without payoff — exactly the failure mode the rule is designed
  to avoid.
- **Aggressive 0-scan index pruning.** Stats were reset on 2026-05-15;
  re-evaluate after a production-traffic window. Pre-launch features
  (competitions, search via trgm) need real users before they light
  up.
- **`auto_publish_due_sets` cron frequency reduction.** Could save
  2/3 of cron fires by going from `*/5` to `*/15`. Trivial migration
  but a behaviour change; left for owner sign-off.

---

## Method notes

This audit pass made heavy use of:
- `npx supabase inspect db index-stats --linked` — actual scan counts
- `npx supabase inspect db calls --linked` — top-10 by call count
- `npx supabase inspect db outliers --linked` — top by total time
- `npx supabase db query --linked "select ... from pg_stat_statements"`
  — direct ad-hoc queries when the inspect commands limited to top-N
- `npx supabase db lint --linked` — caught the broken `get_jam_state`
- `npx supabase db push --linked` — apply migrations
- `npx supabase gen types typescript --project-id <id>` — regen
  `src/lib/database.types.ts` after schema changes

The "verify before claiming" pattern — verifying audit findings
against live `pg_stat_user_indexes` and `pg_stat_statements` before
writing migrations — caught 3 of 4 false-positive composite-index
recommendations in the schema audit. Recommended for the next pass.
