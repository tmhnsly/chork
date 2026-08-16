# Backups: what to check when we test a restore

**Status: not yet verified restorable.** This file exists so that when
the restore test happens it takes minutes rather than an afternoon
working out what "did it work?" means.

An untested backup is not a backup. This is the last unticked item in
the roadmap's *Infrastructure (before scaling)* section, and it's the
one whose failure mode is total.

## Why it wasn't done in-session (2026-08-16)

`supabase db dump` shells out through Docker, and Docker isn't
installed on this machine:

```
LegacyDockerRunError: failed to run docker. Docker Desktop is a
prerequisite for local development.
```

So no backup artefact could be produced here, let alone restored. A
real test needs either Docker locally or — better — a throwaway
Supabase project to restore *into*, which is the thing actually worth
proving. Restoring into the project you are backing up proves nothing
and risks everything.

## The test

1. Take a backup from the dashboard (or `supabase db dump` with Docker
   available).
2. Create a scratch Supabase project.
3. Restore into the scratch project.
4. Check it against the inventory below.
5. Delete the scratch project.

**Do not restore into production to "check".** There is no undo.

## Inventory to check against

Taken from production on **2026-08-16**, at migration **121**. These
are counts, not a schema diff — a mismatch means look closer, a match
means the shape survived.

| | count |
|---|---|
| Migrations applied | 121 |
| Tables (public) | 26 |
| Tables with RLS enabled | 26 |
| RLS policies | 68 |
| Functions (public) | 90 |
| Indexes (public) | 100 |
| Triggers | 25 |
| Extensions | 7 |
| `pg_cron` jobs | 5 |

**Tables with RLS enabled must equal tables.** All 26 carry RLS today;
a restore that brings back 26 tables and 24 RLS flags is a silent
data-exposure bug, not a partial success. Check that row first.

`pg_cron` jobs are the easiest thing to lose in a restore — they live
in the `cron` schema, not `public`, so a `public`-only dump drops all
five without complaining. Set auto-publish and set auto-archive both
depend on them (migration 071).

## Regenerating the inventory

```sh
npx supabase db query --linked "
select 'tables' as kind, count(*)::text as n from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'
union all select 'functions', count(*)::text from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'rls_policies', count(*)::text from pg_policies where schemaname='public'
union all select 'tables_with_rls', count(*)::text from pg_tables t
  join pg_class c on c.relname=t.tablename where t.schemaname='public' and c.relrowsecurity
union all select 'indexes', count(*)::text from pg_indexes where schemaname='public'
union all select 'triggers', count(*)::text from information_schema.triggers where trigger_schema='public'
union all select 'extensions', count(*)::text from pg_extension
union all select 'cron_jobs', count(*)::text from cron.job
union all select 'migrations', count(*)::text from supabase_migrations.schema_migrations
order by 1;"
```

Re-run it before testing, since the numbers move with every migration.
