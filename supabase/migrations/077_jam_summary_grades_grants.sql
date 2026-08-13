-- 077: tighten the grants 076 left too wide on jam_summary_grades
--
-- 076 said `grant select on public.jam_summary_grades to authenticated`
-- and assumed that described the table's privileges. It doesn't: a
-- GRANT *adds* to whatever the schema's default privileges already
-- handed out, it doesn't replace them. Supabase's legacy auto-grant
-- gives every new table in `public` full CRUD to both `anon` and
-- `authenticated`, so the table actually landed with
-- DELETE/INSERT/UPDATE/TRUNCATE for both roles — including `anon`
-- privileges that migration 066 had stripped from every other table
-- in the schema.
--
-- Not exploitable, which is why it's a separate migration rather than
-- an incident: RLS is enabled and the only policy is SELECT to
-- `authenticated`, so an `anon` read matches no policy and returns
-- nothing, and every write is refused for want of a policy. This is
-- defence in depth — the table-level privilege should never be wider
-- than the policy backing it, because the day someone adds an
-- INSERT policy for one narrow case, the grant is already open.
--
-- Narrower than 066's uniform select/insert/update/delete. That
-- migration deliberately mirrored the existing effective access
-- across the whole schema for a zero-change cutover; a brand-new
-- table has no such history to preserve, and CLAUDE.md's rule for new
-- tables is to scope the grant to the RLS. This table's RLS is
-- read-only — the sole writer is `end_jam`, which is SECURITY DEFINER
-- and runs as the owner, so it is unaffected by any of this.
--
-- Audited the rest of the schema while here: `jam_summary_grades` was
-- the only table in `public` with any `anon` privilege, so nothing
-- else has drifted since 066.

revoke all privileges on public.jam_summary_grades from anon;
revoke all privileges on public.jam_summary_grades from authenticated;

grant select on public.jam_summary_grades to authenticated;
