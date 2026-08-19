-- What a restore has to bring back.
--
-- Run against production and against the restored copy, diff the two.
-- One row per fact, `kind|n`, so the comparison is a text diff and a
-- mismatch names the thing that went missing. Read by
-- .github/workflows/backup-drill.yml, and by a human with psql:
--
--   psql "$DB_URL" -At -F '|' -f scripts/backup/inventory.sql
--
-- Two kinds of fact:
--
--   shape — tables, the RLS flag on each, policies, functions,
--           indexes, triggers, cron jobs. `tables_with_rls` must equal
--           `tables`: a restore that brings back 26 tables and 24 RLS
--           flags is a silent data-exposure bug, not a partial success.
--   rows  — an exact count per table in the schemas a backup carries:
--           public, plus the three auth/storage tables that ARE the
--           accounts and the avatars. Not the churny auth tables
--           (sessions, refresh tokens, audit log) — they change under
--           a live project between the dump and the count, and their
--           loss is an inconvenience, not a loss.
--
-- Not compared on purpose: the migration history table (a fresh
-- target has its own), the extension count (a fresh Supabase stack
-- ships extras), and anything in `cron` beyond the job list (run
-- history churns every minute).

with shape as (
  select 'shape:tables' as kind, count(*)::text as n
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
  union all
  select 'shape:tables_with_rls', count(*)::text
    from pg_tables t join pg_class c on c.relname = t.tablename
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = t.schemaname
   where t.schemaname = 'public' and c.relrowsecurity
  union all
  select 'shape:rls_policies', count(*)::text
    from pg_policies where schemaname = 'public'
  union all
  select 'shape:functions', count(*)::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
  union all
  select 'shape:indexes', count(*)::text
    from pg_indexes where schemaname = 'public'
  union all
  select 'shape:triggers', count(*)::text
    from information_schema.triggers where trigger_schema = 'public'
  union all
  select 'shape:cron_jobs', case
    when to_regclass('cron.job') is null then 'no cron schema'
    else (xpath('/row/n/text()',
                query_to_xml('select count(*) as n from cron.job', false, true, '')))[1]::text
  end
),
counted as (
  select t.schemaname, t.tablename
    from pg_tables t
   where t.schemaname = 'public'
      or (t.schemaname = 'auth' and t.tablename in ('users', 'identities'))
      or (t.schemaname = 'storage' and t.tablename in ('objects', 'buckets'))
),
rows_ as (
  select 'rows:' || c.schemaname || '.' || c.tablename as kind,
         (xpath('/row/n/text()',
                query_to_xml(format('select count(*) as n from %I.%I', c.schemaname, c.tablename),
                             false, true, '')))[1]::text as n
    from counted c
)
select kind, n from shape
union all
select kind, n from rows_
order by 1;
