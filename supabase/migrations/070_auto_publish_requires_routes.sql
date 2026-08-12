-- 070: auto_publish_due_sets skips routeless drafts (audit 2026-08-10)
--
-- A scheduled draft that reaches its start time with no routes would
-- auto-publish an empty Wall. Mirror the app-side guard now in
-- updateSet's publish path: only flip a draft to live once it has at
-- least one route. (create-or-replace preserves the existing grants.)
create or replace function public.auto_publish_due_sets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sets
     set status = 'live'
   where status = 'draft'
     and starts_at <= now()
     and exists (select 1 from public.routes r where r.set_id = sets.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
