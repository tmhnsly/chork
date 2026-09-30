-- public.routes_normalise_discipline, as it stands.
-- Generated from supabase/migrations/093_route_discipline_normalise.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.routes_normalise_discipline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_discipline text;
begin
  if new.discipline is null then
    return new;
  end if;

  select discipline into v_set_discipline
    from public.sets where id = new.set_id;

  -- Agreeing with the Set is not an override.
  if new.discipline = v_set_discipline then
    new.discipline := null;
  end if;

  return new;
end;
$$;
