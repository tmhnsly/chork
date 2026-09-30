-- public.route_logs_derive_set_id, as it stands.
-- Generated from supabase/migrations/081_route_log_set_id_trigger.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.route_logs_derive_set_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select r.set_id into new.set_id
    from public.routes r
   where r.id = new.route_id;

  if new.set_id is null then
    -- The FK on route_id makes this unreachable; failing loudly beats
    -- a NOT NULL violation whose message doesn't say why.
    raise exception 'route % has no set', new.route_id;
  end if;

  return new;
end;
$$;
