-- public.auto_publish_due_sets, as it stands.
-- Generated from supabase/migrations/145_gym_admins_can_run_their_wall.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.auto_publish_due_sets()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_gyms uuid[];
  v_count integer;
begin
  select array_agg(due.id), array_agg(due.gym_id)
    into v_ids, v_gyms
    from (
      select distinct on (s.gym_id) s.id, s.gym_id
        from public.sets s
       where s.owner_kind = 'gym'
         and s.status = 'draft'
         and s.starts_at <= now()
         and (s.ends_at is null or s.ends_at > now())
         and exists (select 1 from public.routes r where r.set_id = s.id)
       order by s.gym_id, s.starts_at desc
    ) due;

  if v_ids is null then
    return 0;
  end if;

  update public.sets
     set status = 'archived'
   where owner_kind = 'gym'
     and status = 'live'
     and gym_id = any(v_gyms);

  update public.sets
     set status = 'live'
   where id = any(v_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
