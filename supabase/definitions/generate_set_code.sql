-- public.generate_set_code, as it stands.
-- Generated from supabase/migrations/084_match_rpcs.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.generate_set_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
  attempt integer := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.sets where code = candidate);

    attempt := attempt + 1;
    if attempt > 50 then
      raise exception 'Could not allocate a join code' using errcode = 'P0001';
    end if;
  end loop;

  return candidate;
end;
$$;
