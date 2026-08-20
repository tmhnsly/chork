# Backups: what exists, what the drill proves, what is still yours

**Status (2026-08-20):** the restore procedure is built, automated and
proven against a real Supabase stack every Monday. **The plan question
is settled for now: no paid backups** — Tom's call, because 50 of 53
accounts and 452 of 459 route logs are seed data, so a total loss
today costs about an hour of re-seeding (migrations rebuild the
schema, seed scripts rebuild the fake climbers). **The trigger to
revisit: the first real climbers logging real sends.** From that day,
their data is not ours to lose — flip on Pro, or ask Claude for the
free fallback (weekly dump encrypted with a repo-secret passphrase,
stored as a GitHub artifact). The production half of the drill also
stays parked until then; its Monday "skipped" warning is that decision
showing, not a fault.

## What backs up production today

The repo's `supabase/migrations/` is a complete backup of the
**schema**: the `replay` job below applies all of it to an empty stack
and gets production's shape back exactly — 26 tables, 26 with RLS, 68
policies, 93 functions, 100 indexes, 25 triggers, 5 cron jobs.

The **data** is a different story. Supabase-managed backups exist on
the Pro plan and above (daily, 7-day retention; PITR is an add-on).
`supabase backups list --project-ref cfyagiwtzrgfjtwaevlh` returns
**no backups and PITR off**, which is what a Free-plan project
returns. The dashboard is the authority — Database → Backups — and
if it says backups are not available on your plan, then today a lost
database is a lost database: 53 accounts, 459 route logs, every
friend link, every match. The drill in this file verifies that a
backup *can* be taken and restored; it deliberately does not *keep*
one, because the repo is public and a dump of production has emails
and password hashes in it. So one of two things needs deciding before
launch, and the roadmap says which is recommended:

1. **Pro plan** ($25/mo) — daily backups kept by Supabase, restorable
   from the dashboard into a new project, which is exactly the target
   this drill rehearses. Recommended; it is the difference between
   "we can restore" and "there is something to restore".
2. **Self-kept dumps** — the drill's four files, encrypted, to a
   private bucket on a schedule. More secrets, more design, and
   still no PITR. Only if Pro is off the table.

## The drill: `.github/workflows/backup-drill.yml`

Two jobs, both against the CLI's own Supabase stack in Docker on the
runner. Mondays 06:17 UTC, on every change to the migrations, and on
demand (Actions → Backup drill → Run workflow).

**`replay` — the schema rebuilds from nothing but the repo.**
`supabase start` + `supabase db reset` applies every migration to an
empty stack; `scripts/backup/inventory.sql` counts what came back;
the job fails if any table lacks RLS or no cron jobs exist. Then it
runs the restore drill **against itself**: dumps that stack, restores
into a second empty stack on shifted ports, diffs. So the dump flags
and the restore recipe are proven on every run, secret or no secret.

**`restore` — dump production, restore it, diff.** The same script,
`scripts/backup/restore-drill.sh`, with production as the source:

```
supabase db dump --db-url "$SUPABASE_DB_URL" -f roles.sql  --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" -f data.sql   --data-only --use-copy -x <storage internals>
psql "$SOURCE" -c "select format('select cron.schedule(%L,%L,%L);', jobname, schedule, command) from cron.job" > cron.sql

psql "$TARGET" --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' --file data.sql
psql "$TARGET" --file cron.sql
```

then `inventory.sql` on both ends, `diff`, and an RLS probe on the
copy (`authenticated` with no session must see zero `route_logs`).
The dump files are deleted on exit however the script ends, and the
stack is stopped; nothing is uploaded.

**It needs one secret: `SUPABASE_DB_URL`.** The *session pooler*
connection string (Dashboard → Connect → Session pooler, port 5432:
`postgresql://postgres.cfyagiwtzrgfjtwaevlh:<password>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`),
with the password percent-encoded. Not the direct host — it is
IPv6-only and GitHub's runners have no IPv6. Then:

```sh
gh secret set SUPABASE_DB_URL
```

Without it the job **skips loudly** — a warning on the run and a ⚠️
in the summary — rather than passing. A drill that quietly never ran
is how the day comes when nothing restores.

## What the drill found on its first runs

Three things, each of which would have stopped a real restore, all
fixed in the script and worth knowing if you ever restore by hand:

- **The roles dump carries a platform grant the target refuses.**
  `GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin"`
  survives the CLI's role filter, and `postgres` (not a superuser, on
  hosted and local alike) cannot make it. The target already has it —
  it is Realtime's. The script strips parameter grants to managed
  roles and says so.
- **Storage's internal tables are not yours to write.** The data dump
  carries `storage.buckets_vectors`, `iceberg_*`, `s3_multipart_*` and
  the like; `postgres` may not COPY into them. Only `buckets` and
  `objects` — the avatar files' metadata — are ours, and only they are
  restored. The internal list is computed from the source each run.
- **`supabase db dump` carries no pg_cron jobs.** The `cron` schema is
  excluded from the schema dump and the data dump brought back none —
  5 became 0 on the first diff. Set auto-publish and auto-archive
  depend on them (migration 071). The drill dumps them as
  `cron.schedule` calls and replays them after the data. In a real
  restore the source is gone; that file is why the jobs are not.

And one thing the drill cannot carry: **the avatar files themselves.**
A database backup holds `storage.objects` rows, not the bytes in the
bucket. Uploaded avatars live in Supabase Storage; Google avatars are
URLs and need nothing. Pro-plan backups do not include Storage files
either. Small today (4 objects), worth a line in whatever the
off-site decision above becomes.

## Restoring for real

Into a **new** project — never into the one you are restoring, there
is no undo:

1. Create the project (same region, Postgres 17).
2. Run the four dumps against the broken/old project if it is still
   reachable, or take them from wherever the chosen off-site copy is.
3. Run the psql recipe above against the new project's connection
   string, as `postgres`.
4. Run `inventory.sql` against the new project and compare to the
   last green drill's summary (Actions → Backup drill → latest run).
   `tables_with_rls` must equal `tables`; `cron_jobs` must be 5.
5. Re-create the storage bucket and re-upload any avatar files; point
   Vercel's env at the new project; re-enable the Google provider and
   the redirect URLs (`docs/google-signin-setup.md`).

## Inventory

`scripts/backup/inventory.sql` — one row per fact, `kind|n`. Shape
facts (tables, RLS flags, policies, functions, indexes, triggers, cron
jobs) and an exact row count for every `public` table plus
`auth.users`, `auth.identities`, `storage.buckets`, `storage.objects`.
Run it by hand with:

```sh
psql "$DB_URL" -At -F '|' -f scripts/backup/inventory.sql
# or, without a connection string, through the Management API:
npx supabase db query --linked --file scripts/backup/inventory.sql
```

Production on 2026-08-19 (migration 132): tables 26 · with RLS 26 ·
policies 68 · functions 93 · indexes 100 · triggers 25 · cron jobs 5.
The numbers move with every migration; the replay job is the living
copy of this table.
