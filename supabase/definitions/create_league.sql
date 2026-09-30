-- public.create_league, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.create_league(p_name text, p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  new_id uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Give the league a name (up to 80 characters).';
  end if;
  perform public.league_assert_addable(p_set_id, caller_id);

  insert into public.leagues (host_id, name) values (caller_id, v_name)
  returning id into new_id;
  update public.sets set league_id = new_id where id = p_set_id;
  return new_id;
end;
$$;
