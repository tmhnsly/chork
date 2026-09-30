-- public.rename_league, as it stands.
-- Generated from supabase/migrations/133_league.sql by `pnpm db:definitions`.
-- Do not edit: change a function with a migration, then regenerate.

create or replace function public.rename_league(p_league_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Give the league a name (up to 80 characters).';
  end if;
  perform public.league_assert_host(p_league_id, caller_id);
  update public.leagues set name = v_name where id = p_league_id;
  return p_league_id;
end;
$$;
